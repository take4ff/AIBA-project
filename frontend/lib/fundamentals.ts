// 決算・ファンダ指標の「解釈」をルールベースで生成する（表示用）。

export interface Fundamentals {
  quote_type: string | null;
  next_earnings_date: string | null;
  last_surprise_pct: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  eps_growth: number | null;     // 比率（0.1 = +10%）
  revenue_growth: number | null; // 比率
  // 事業の頑丈さ（品質）指標
  operating_margin?: number | null;  // 営業利益率（比率）
  roe?: number | null;               // 自己資本利益率（比率）
  debt_to_equity?: number | null;    // D/E（％・yfinance準拠）
  current_ratio?: number | null;     // 流動比率
  free_cashflow?: number | null;     // フリーCF（通貨建て）
  // ハイリスク・グロース銘柄の買い判断材料
  psr?: number | null;               // 株価売上高倍率
  gross_margin?: number | null;      // 売上総利益率（比率）
  burn_rate_monthly?: number | null; // 月次バーンレート（通貨建て、営業CFマイナス時のみ）
  cash_runway_months?: number | null; // キャッシュランウェイ（月）
}

export interface Interpretation { tone: "pos" | "neg" | "neutral"; text: string }

const clampQ = (x: number) => Math.max(0, Math.min(100, x));

export interface QualityScore {
  score: number | null;                 // 0-100（高いほど頑丈）
  label: "頑健" | "良好" | "標準" | "やや脆弱" | "脆弱" | null;
  parts: { name: string; pts: number; note: string }[];
}

/**
 * 事業の頑丈さ（品質）スコア：収益性・財務健全性・キャッシュ創出 から 0-100。
 * 利用可能な指標のみで加重平均（取得不可は除外）。下方リスクの低い「崩れにくい事業」の目安。
 */
export function qualityScore(f: Fundamentals): QualityScore {
  const parts: { name: string; pts: number; note: string }[] = [];

  // 収益性：営業利益率（0%→40, 20%→80, 40%以上→100、赤字→0〜30）
  if (f.operating_margin != null) {
    const m = f.operating_margin * 100;
    const pts = m < 0 ? clampQ(30 + m) : clampQ(40 + m * 1.5);
    parts.push({ name: "収益性(営業利益率)", pts, note: `${m.toFixed(0)}%` });
  }
  // 資本効率：ROE（0%→40, 15%→80, 25%以上→100、マイナス→0〜30）
  if (f.roe != null) {
    const r = f.roe * 100;
    const pts = r < 0 ? clampQ(30 + r) : clampQ(40 + r * 2.4);
    parts.push({ name: "資本効率(ROE)", pts, note: `${r.toFixed(0)}%` });
  }
  // 財務健全性：D/E（％。0→100, 100%→55, 200%以上→20）
  if (f.debt_to_equity != null) {
    const de = f.debt_to_equity;
    const pts = clampQ(100 - de * 0.45);
    parts.push({ name: "財務健全性(D/E)", pts, note: `${de.toFixed(0)}%` });
  }
  // 流動性：流動比率（1.0→50, 2.0→90, 0.5以下→20）
  if (f.current_ratio != null) {
    const cr = f.current_ratio;
    const pts = clampQ(10 + cr * 40);
    parts.push({ name: "流動性(流動比率)", pts, note: cr.toFixed(2) });
  }
  // キャッシュ創出：FCFの符号（プラス→85, マイナス→25）
  if (f.free_cashflow != null) {
    const pts = f.free_cashflow > 0 ? 85 : 25;
    parts.push({ name: "キャッシュ創出(FCF)", pts, note: f.free_cashflow > 0 ? "プラス" : "マイナス" });
  }

  if (parts.length < 2) return { score: null, label: null, parts };
  const score = Math.round(parts.reduce((a, b) => a + b.pts, 0) / parts.length);
  const label: QualityScore["label"] =
    score >= 80 ? "頑健" : score >= 65 ? "良好" : score >= 50 ? "標準" : score >= 35 ? "やや脆弱" : "脆弱";
  return { score, label, parts };
}

const daysUntil = (d: string | null) => {
  if (!d) return null;
  return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86_400_000);
};

/** 指標から人間向けの解釈ポイントを返す。 */
export function interpretFundamentals(f: Fundamentals): Interpretation[] {
  const out: Interpretation[] = [];
  const pe = f.forward_pe && f.forward_pe > 0 ? f.forward_pe : f.trailing_pe && f.trailing_pe > 0 ? f.trailing_pe : null;
  const eps = f.eps_growth;

  // バリュエーション
  if (pe != null) {
    if (pe < 15) out.push({ tone: "pos", text: `PER ${pe.toFixed(0)} は割安水準。市場の期待は控えめで、業績が伴えば見直し余地。` });
    else if (pe < 25) out.push({ tone: "neutral", text: `PER ${pe.toFixed(0)} は標準的な水準。` });
    else if (pe < 40) out.push({ tone: "neutral", text: `PER ${pe.toFixed(0)} はやや割高。相応の成長を織り込み済み。` });
    else out.push({ tone: "neg", text: `PER ${pe.toFixed(0)} は割高。高い成長期待が前提で、未達なら下落リスク。` });
  }

  // 実績PER vs 予想PER（来期見通し）
  if (f.trailing_pe && f.forward_pe && f.trailing_pe > 0 && f.forward_pe > 0) {
    if (f.forward_pe < f.trailing_pe * 0.9) out.push({ tone: "pos", text: "予想PERが実績より低く、来期は増益見込み（市場は改善を期待）。" });
    else if (f.forward_pe > f.trailing_pe * 1.1) out.push({ tone: "neg", text: "予想PERが実績より高く、来期は減益見込み。" });
  }

  // 増益/減益
  if (eps != null) {
    const p = (eps * 100).toFixed(0);
    if (eps < 0) out.push({ tone: "neg", text: `直近は減益（EPS ${p}%）。収益力の低下に注意。` });
    else if (eps >= 0.2) out.push({ tone: "pos", text: `高い増益（EPS +${p}%）。成長が加速。` });
    else out.push({ tone: "pos", text: `増益（EPS +${p}%）。` });
  }

  // 増収/減収
  if (f.revenue_growth != null) {
    const p = (f.revenue_growth * 100).toFixed(0);
    if (f.revenue_growth < 0) out.push({ tone: "neg", text: `減収（売上 ${p}%）。` });
    else if (f.revenue_growth >= 0.2) out.push({ tone: "pos", text: `高い増収（売上 +${p}%）。需要が拡大。` });
  }

  // 直近サプライズ
  if (f.last_surprise_pct != null) {
    if (f.last_surprise_pct > 5) out.push({ tone: "pos", text: `直近決算は市場予想を上回った（+${f.last_surprise_pct.toFixed(0)}%）。` });
    else if (f.last_surprise_pct < -5) out.push({ tone: "neg", text: `直近決算は市場予想を下回った（${f.last_surprise_pct.toFixed(0)}%）。` });
  }

  // 複合の読み
  if (pe != null && eps != null) {
    if (pe >= 30 && eps < 0) out.push({ tone: "neg", text: "割高×減益＝業績悪化局面での高値。慎重に。" });
    else if (pe < 18 && eps > 0) out.push({ tone: "pos", text: "割安×増益＝バリュー妙味のある組み合わせ。" });
  }

  // 次回決算
  const d = daysUntil(f.next_earnings_date);
  if (d != null && d >= 0 && d <= 14) {
    out.push({ tone: "neutral", text: `次回決算が${d}日後（${f.next_earnings_date}）。発表前後は変動が大きく、結果次第で評価が一変し得る。` });
  }

  if (out.length === 0) out.push({ tone: "neutral", text: "解釈に十分なファンダ情報がありません（ETF・新規上場など）。" });
  return out;
}
