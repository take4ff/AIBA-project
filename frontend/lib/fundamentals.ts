// 決算・ファンダ指標の「解釈」をルールベースで生成する（表示用）。

export interface Fundamentals {
  quote_type: string | null;
  next_earnings_date: string | null;
  last_surprise_pct: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  eps_growth: number | null;     // 比率（0.1 = +10%）
  revenue_growth: number | null; // 比率
}

export interface Interpretation { tone: "pos" | "neg" | "neutral"; text: string }

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
