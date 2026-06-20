import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { RankingRow } from "./types";
import { Region, Kind, parseDomainId } from "./regions";

// 日次更新の公開データを 10 分キャッシュ（searchParams 付きの動的ページでも重い集計を再利用）。
const CACHE_TTL = 600;

// 最新行＋センチメント/株価の傾き算出のため、直近この日数を取得
const LOOKBACK_DAYS = 45;
const BUY_LEVEL = 60; // Pickup の「今買い」閾値

function cutoffDate(): string {
  return new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
}
const clamp = (x: number) => Math.max(0, Math.min(100, x));

const PAGE = 1000;
/**
 * Supabase/PostgREST の 1000行上限を回避し、全行をページングで取得する。
 * `apply` でフィルタ・並び替えを付与できる（query factory 形式）。
 */
async function selectAll<T = any>(
  table: string, columns: string, apply?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    if (apply) q = apply(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) { console.error(`fetch error (${table}):`, error.message); break; }
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** 全ドメインの最新 RankingRow を1回のfetchで構築する（地域・種別すべて）。 */
async function buildAllRows(): Promise<RankingRow[]> {
  const [domains, metrics, preds] = await Promise.all([
    selectAll<any>("domains", "id,name,layer,ticker"),
    selectAll<any>("daily_metrics",
      "domain_id,trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation,close_price",
      (q) => q.gte("trade_date", cutoffDate())),
    selectAll<any>("predictions", "domain_id,as_of_date,buyzone_prob,pred_aiba",
      (q) => q.gte("as_of_date", cutoffDate())),
  ]);
  if (domains.length === 0) {
    console.error("data fetch error: no domains");
    return [];
  }

  const pred = new Map<string, any>();
  for (const p of preds) {
    const cur = pred.get(p.domain_id);
    if (!cur || p.as_of_date > cur.as_of_date) pred.set(p.domain_id, p);
  }

  const latest = new Map<string, any>();
  const firstSent = new Map<string, any>();
  for (const m of metrics) {
    const cur = latest.get(m.domain_id);
    if (!cur || m.trade_date > cur.trade_date) latest.set(m.domain_id, m);
    const f = firstSent.get(m.domain_id);
    if (!f || m.trade_date < f.trade_date) firstSent.set(m.domain_id, m);
  }

  // 前営業日（最新日より前で最も新しい日）の行＝順位変動の比較用
  const prevDay = new Map<string, any>();
  for (const m of metrics) {
    const lt = latest.get(m.domain_id);
    if (!lt || m.trade_date >= lt.trade_date) continue;
    const cur = prevDay.get(m.domain_id);
    if (!cur || m.trade_date > cur.trade_date) prevDay.set(m.domain_id, m);
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
      prev_aiba: prevDay.get(id)?.aiba_score ?? null,
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

// 全ドメインの集計（重い）を 10 分キャッシュ。全ランキング系がこれを共有・再利用する。
const cachedAllRows = unstable_cache(buildAllRows, ["aiba-all-rows"], { revalidate: CACHE_TTL });

/** 指定地域・種別の最新ランキング。 */
export async function getRanking(region: Region, kind: Kind): Promise<RankingRow[]> {
  return (await cachedAllRows()).filter((r) => r.region === region && r.kind === kind);
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

/** バックテスト結果の全履歴（run_date昇順）。 */
export async function getBacktestHistory(horizon = 21): Promise<BacktestRun[]> {
  return selectAll<BacktestRun>("backtest_runs", "*",
    (q) => q.eq("horizon", horizon).order("run_date", { ascending: true }));
}

export interface ICMonth {
  month: string;
  ic_aiba: number | null; ic_technical: number | null; ic_sentiment: number | null;
}

/** 月次クロスセクションIC（過去〜現在）。IC推移グラフ用。テーブル未作成時は空。 */
export async function getICMonthly(): Promise<ICMonth[]> {
  return selectAll<ICMonth>("ic_monthly", "month,ic_aiba,ic_technical,ic_sentiment",
    (q) => q.order("month", { ascending: true }));
}

export interface SnapshotRow {
  snapshot_date: string; domain_id?: string; is_buy: boolean | null; aiba_score: number | null;
  ret_1m: number | null; ret_3m: number | null; ret_6m: number | null; ret_12m: number | null;
}

/** 定点記録（スコアのスナップショット）。out-of-sample 検証用。全行ページング取得。10分キャッシュ。 */
export const getSnapshots = unstable_cache(
  async (): Promise<SnapshotRow[]> =>
    selectAll<SnapshotRow>("score_snapshots",
      "snapshot_date,domain_id,is_buy,aiba_score,ret_1m,ret_3m,ret_6m,ret_12m"),
  ["aiba-snapshots"], { revalidate: CACHE_TTL },
);

export interface BenchmarkPoint { trade_date: string; close: number }

/** ベンチマーク指数の日次終値（既定 ACWI）。全行ページング取得。テーブル未作成時は空配列。 */
export async function getBenchmark(ticker = "ACWI"): Promise<BenchmarkPoint[]> {
  const rows = await selectAll<any>("benchmark_prices", "trade_date,close",
    (q) => q.eq("ticker", ticker).order("trade_date", { ascending: true }));
  return rows.map((r) => ({ trade_date: r.trade_date, close: Number(r.close) }));
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

/** テーマ別ニュース論調（GDELT平均トーン）。テーブル未作成でも空Mapで安全。10分キャッシュ。 */
export const getThemeTone = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data, error } = await supabase.from("theme_news_tone").select("theme_id,tone");
    if (error) return {};
    const out: Record<string, number> = {};
    for (const r of data ?? []) if ((r as any).tone != null) out[(r as any).theme_id] = Number((r as any).tone);
    return out;
  },
  ["aiba-theme-tone"], { revalidate: CACHE_TTL },
);

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
  return (await cachedAllRows()).sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));
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
  return (await cachedAllRows())
    .filter((r) => (r.aiba_score ?? 0) >= BUY_LEVEL || r.divergence)
    .sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));
}
