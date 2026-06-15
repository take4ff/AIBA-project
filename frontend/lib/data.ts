import { supabase } from "./supabase";
import { RankingRow } from "./types";
import { Region, Kind, parseDomainId } from "./regions";

// 最新行＋センチメント/株価の傾き算出のため、直近この日数を取得
const LOOKBACK_DAYS = 45;
const BUY_LEVEL = 60; // Pickup の「今買い」閾値

function cutoffDate(): string {
  return new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
}
const clamp = (x: number) => Math.max(0, Math.min(100, x));

/** 全ドメインの最新 RankingRow を1回のfetchで構築する（地域・種別すべて）。 */
async function buildAllRows(): Promise<RankingRow[]> {
  const [domainsRes, metricsRes, predRes] = await Promise.all([
    supabase.from("domains").select("id,name,layer,ticker"),
    supabase
      .from("daily_metrics")
      .select("domain_id,trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation,close_price")
      .gte("trade_date", cutoffDate()),
    supabase.from("predictions").select("domain_id,as_of_date,buyzone_prob,pred_aiba").gte("as_of_date", cutoffDate()),
  ]);
  if (domainsRes.error || metricsRes.error) {
    console.error("data fetch error:", domainsRes.error?.message, metricsRes.error?.message);
    return [];
  }
  const domains = domainsRes.data ?? [];

  const pred = new Map<string, any>();
  for (const p of predRes.data ?? []) {
    const cur = pred.get(p.domain_id);
    if (!cur || p.as_of_date > cur.as_of_date) pred.set(p.domain_id, p);
  }

  const latest = new Map<string, any>();
  const firstSent = new Map<string, any>();
  for (const m of metricsRes.data ?? []) {
    const cur = latest.get(m.domain_id);
    if (!cur || m.trade_date > cur.trade_date) latest.set(m.domain_id, m);
    const f = firstSent.get(m.domain_id);
    if (!f || m.trade_date < f.trade_date) firstSent.set(m.domain_id, m);
  }

  // 地域×テーマごとの業界ETFスコア（並び順キー）
  const etfScore = new Map<string, number>();
  for (const [id, m] of latest) {
    const p = parseDomainId(id);
    if (p.kind === "etf") etfScore.set(`${p.region}|${p.theme}`, m.aiba_score ?? -1);
  }

  const themeName = new Map<string, string>();
  for (const d of domains) {
    const p = parseDomainId(d.id);
    if (p.region === "global" && p.kind === "etf") themeName.set(p.theme, d.name);
  }

  const domMap = new Map(domains.map((d) => [d.id, d]));
  const rows: RankingRow[] = [];
  for (const [id, m] of latest) {
    const d = domMap.get(id);
    if (!d) continue;
    const p = parseDomainId(id);
    const sentNow = m.sentiment_score ?? 50;
    const past = firstSent.get(id);
    const sentPast = past?.sentiment_score ?? sentNow;
    const sentimentTrend = Math.round((sentNow - sentPast) * 10) / 10;
    const sentMomentum = clamp(50 + sentimentTrend * 3);
    const aiba = m.aiba_score ?? 0;
    const comboScore = Math.round(0.5 * aiba + 0.5 * sentMomentum);
    const closePast = past?.close_price ?? m.close_price;
    const priceTrend = closePast ? Math.round(((m.close_price - closePast) / closePast) * 1000) / 10 : 0;
    // 順張りモメンタム（0-100）: MAより上・RSI強い・直近上昇 ほど高い（AIBAの逆張りと対の視点）
    const rsi = m.rsi_14 ?? 50;
    const maPos = clamp(50 + (m.ma_deviation ?? 0) * 3);
    const rsiMom = clamp(rsi - Math.max(0, rsi - 80) * 2);   // 高RSI=勢い、80超は過熱で減衰
    const priceMom = clamp(50 + priceTrend * 2);
    const momentumScore = Math.round((maPos + rsiMom + priceMom) / 3);
    rows.push({
      layer: d.layer,
      region: p.region,
      kind: p.kind,
      domain_id: id,
      domain_name: d.name,
      theme_name: themeName.get(p.theme) ?? d.name,
      ticker: d.ticker,
      trade_date: m.trade_date,
      aiba_score: m.aiba_score,
      technical_score: m.technical_score,
      sentiment_score: m.sentiment_score,
      rsi_14: m.rsi_14,
      ma_deviation: m.ma_deviation,
      close_price: m.close_price,
      buyzone_prob: pred.get(id)?.buyzone_prob ?? null,
      pred_aiba: pred.get(id)?.pred_aiba ?? null,
      sentiment_trend: sentimentTrend,
      price_trend: priceTrend,
      divergence: sentimentTrend > 1 && priceTrend < 2,
      combo_score: comboScore,
      momentum_score: momentumScore,
      order_key: etfScore.get(`${p.region}|${p.theme}`) ?? aiba,
    });
  }
  return rows;
}

/** 指定地域・種別の最新ランキング。 */
export async function getRanking(region: Region, kind: Kind): Promise<RankingRow[]> {
  return (await buildAllRows()).filter((r) => r.region === region && r.kind === kind);
}

/** 指定テーマ×地域の構成銘柄（業界ETF＋個別株）。業界ページ用。
 * global は地域横断：global ETF＋全地域の個別株を表示する。 */
export async function getIndustry(theme: string, region: Region): Promise<RankingRow[]> {
  const all = (await buildAllRows()).filter((r) => parseDomainId(r.domain_id).theme === theme);
  const rows = region === "global"
    ? all.filter((r) => r.region === "global" || r.kind === "stock")  // global ETF＋全個別株
    : all.filter((r) => r.region === region);
  return rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "etf" ? -1 : 1;          // ETFを先頭
    return (b.aiba_score ?? 0) - (a.aiba_score ?? 0);                 // 個別株はAIBA降順
  });
}

export interface BacktestRun {
  run_date: string; horizon: number; n_samples: number | null;
  ic_aiba: number | null; ic_technical: number | null; ic_sentiment: number | null;
  buy_threshold: number | null; buy_count: number | null;
  buy_avg_return: number | null; overall_avg_return: number | null;
  best_w_l1: number | null; best_w_l2: number | null; best_w_l3: number | null;
}

/** 最新のバックテスト結果（無ければ null）。 */
export async function getBacktest(): Promise<BacktestRun | null> {
  const { data, error } = await supabase
    .from("backtest_runs").select("*").order("run_date", { ascending: false }).limit(1);
  if (error) {
    console.error("backtest fetch error:", error.message);
    return null;
  }
  return (data?.[0] as BacktestRun) ?? null;
}

export interface SnapshotRow {
  snapshot_date: string; is_buy: boolean | null;
  ret_1m: number | null; ret_3m: number | null; ret_6m: number | null;
}

/** 定点記録（スコアのスナップショット）。out-of-sample 検証用。 */
export async function getSnapshots(): Promise<SnapshotRow[]> {
  const { data } = await supabase
    .from("score_snapshots").select("snapshot_date,is_buy,ret_1m,ret_3m,ret_6m");
  return (data ?? []) as SnapshotRow[];
}

export interface BenchmarkPoint { trade_date: string; close: number }

/** ベンチマーク指数の日次終値（既定 ACWI）。テーブル未作成時は空配列。 */
export async function getBenchmark(ticker = "ACWI"): Promise<BenchmarkPoint[]> {
  const { data, error } = await supabase
    .from("benchmark_prices")
    .select("trade_date,close")
    .eq("ticker", ticker)
    .order("trade_date", { ascending: true });
  if (error) {
    console.error("benchmark fetch error:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ trade_date: (r as any).trade_date, close: Number((r as any).close) }));
}

/** 現在の USD/JPY レート（取得失敗時はフォールバック）。 */
export async function getUsdJpy(): Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } });
    const j = await r.json();
    const v = j?.rates?.JPY;
    return typeof v === "number" && v > 50 ? Math.round(v * 100) / 100 : 157;
  } catch {
    return 157;
  }
}

export interface CandidateTheme {
  candidate_id: string;
  name: string;
  keywords: string[] | null;
  heat_score: number | null;
}

/** 新興テーマ候補（ユニバース未採用）を熱量降順で。テーブル未作成時は空配列。 */
export async function getCandidates(): Promise<CandidateTheme[]> {
  const { data, error } = await supabase
    .from("candidate_themes")
    .select("candidate_id,name,keywords,heat_score")
    .order("heat_score", { ascending: false });
  if (error) {
    console.error("candidates fetch error:", error.message);
    return [];
  }
  return (data ?? []) as CandidateTheme[];
}

/** スクリーナー用：全ドメインの最新行（フィルタはクライアント側で行う）。 */
export async function getAllRows(): Promise<RankingRow[]> {
  return (await buildAllRows()).sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));
}

/** ticker → 予想PER・EPS成長 のマップ（スクリーナーのファンダ条件用）。 */
export async function getFundamentalsMap(): Promise<Record<string, { forward_pe: number | null; eps_growth: number | null }>> {
  const { data } = await supabase.from("ticker_fundamentals").select("ticker,forward_pe,eps_growth");
  const map: Record<string, { forward_pe: number | null; eps_growth: number | null }> = {};
  for (const r of data ?? []) {
    map[(r as any).ticker] = {
      forward_pe: (r as any).forward_pe != null ? Number((r as any).forward_pe) : null,
      eps_growth: (r as any).eps_growth != null ? Number((r as any).eps_growth) : null,
    };
  }
  return map;
}

/** Pickup: 地域・種別を問わず「今買い」候補（AIBA≥閾値 or 乖離）をAIBA順で。 */
export async function getPickup(): Promise<RankingRow[]> {
  return (await buildAllRows())
    .filter((r) => (r.aiba_score ?? 0) >= BUY_LEVEL || r.divergence)
    .sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));
}
