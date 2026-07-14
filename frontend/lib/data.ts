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

// domains を取得。tags 列が未マイグレーションでも壊れないよう、失敗したら tags 抜きで再取得。
async function fetchDomains(): Promise<any[]> {
  try {
    const out: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("domains").select("id,name,layer,ticker,tags").range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  } catch {
    return selectAll<any>("domains", "id,name,layer,ticker");
  }
}

/** 集計に必要な最小セット：最新行＋前営業日AIBA＋約45日前のセンチ/終値＋最新予測。 */
interface MergedRow {
  domain_id: string;
  trade_date: string;
  aiba_score: number | null;
  technical_score: number | null;
  sentiment_score: number | null;
  rsi_14: number | null;
  ma_deviation: number | null;
  ma75_deviation: number | null;
  ma200_deviation: number | null;
  close_price: number | null;
  prev_aiba: number | null;
  past_sentiment: number | null;
  past_close: number | null;
  buyzone_prob: number | null;
  pred_aiba: number | null;
}

/** DB側で集約済みの latest_metrics ビュー（db/latest_metrics.sql）。約235行・1リクエストで済む。 */
async function fetchMergedFromView(): Promise<MergedRow[] | null> {
  const { data, error } = await supabase.from("latest_metrics").select("*");
  if (error || !data || data.length === 0) return null; // ビュー未作成時はフォールバック
  return data as unknown as MergedRow[];
}

/** フォールバック：daily_metrics 45日分（約1万行・ページング）を取得してクライアント側で集約。 */
async function fetchMergedLegacy(): Promise<MergedRow[]> {
  const [metrics, preds] = await Promise.all([
    selectAll<any>("daily_metrics",
      "domain_id,trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation,ma75_deviation,ma200_deviation,close_price",
      (q) => q.gte("trade_date", cutoffDate())),
    selectAll<any>("predictions", "domain_id,as_of_date,buyzone_prob,pred_aiba",
      (q) => q.gte("as_of_date", cutoffDate())),
  ]);

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

  return [...latest.values()].map((m) => ({
    ...m,
    prev_aiba: prevDay.get(m.domain_id)?.aiba_score ?? null,
    past_sentiment: firstSent.get(m.domain_id)?.sentiment_score ?? null,
    past_close: firstSent.get(m.domain_id)?.close_price ?? null,
    buyzone_prob: pred.get(m.domain_id)?.buyzone_prob ?? null,
    pred_aiba: pred.get(m.domain_id)?.pred_aiba ?? null,
  }));
}

/** 全ドメインの最新 RankingRow を構築する（地域・種別すべて）。 */
async function buildAllRows(): Promise<RankingRow[]> {
  const [domains, merged] = await Promise.all([
    fetchDomains(),
    fetchMergedFromView().then((rows) => rows ?? fetchMergedLegacy()),
  ]);
  if (domains.length === 0) {
    console.error("data fetch error: no domains");
    return [];
  }

  // 地域×テーマごとの業界ETFスコア（並び順キー）
  const etfScore = new Map<string, number>();
  for (const m of merged) {
    const p = parseDomainId(m.domain_id);
    if (p.kind === "etf") etfScore.set(`${p.region}|${p.theme}`, m.aiba_score ?? -1);
  }

  const themeName = new Map<string, string>();
  for (const d of domains) {
    const p = parseDomainId(d.id);
    if (p.region === "global" && p.kind === "etf") themeName.set(p.theme, d.name);
  }

  const domMap = new Map(domains.map((d) => [d.id, d]));
  const rows: RankingRow[] = [];
  for (const m of merged) {
    const id = m.domain_id;
    const d = domMap.get(id);
    if (!d) continue;
    const p = parseDomainId(id);
    const sentNow = m.sentiment_score ?? 50;
    const sentPast = m.past_sentiment ?? sentNow;
    const sentimentTrend = Math.round((sentNow - sentPast) * 10) / 10;
    const sentMomentum = clamp(50 + sentimentTrend * 3);
    const aiba = m.aiba_score ?? 0;
    const comboScore = Math.round(0.5 * aiba + 0.5 * sentMomentum);
    const closePast = m.past_close ?? m.close_price;
    const priceTrend = closePast && m.close_price != null
      ? Math.round(((m.close_price - closePast) / closePast) * 1000) / 10 : 0;
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
      prev_aiba: m.prev_aiba,
      technical_score: m.technical_score,
      sentiment_score: m.sentiment_score,
      rsi_14: m.rsi_14,
      ma_deviation: m.ma_deviation,
      ma75_deviation: m.ma75_deviation ?? null,
      ma200_deviation: m.ma200_deviation ?? null,
      close_price: m.close_price,
      buyzone_prob: m.buyzone_prob,
      pred_aiba: m.pred_aiba,
      sentiment_trend: sentimentTrend,
      price_trend: priceTrend,
      divergence: sentimentTrend > 1 && priceTrend < 2,
      combo_score: comboScore,
      momentum_score: momentumScore,
      order_key: etfScore.get(`${p.region}|${p.theme}`) ?? aiba,
      tags: Array.isArray(d.tags) ? d.tags : [],
    });
  }

  // ピアモメンタム：テーマ別の個別株AIBA平均を算出し各行に付与
  const themeScores = new Map<string, number[]>();
  for (const r of rows) {
    if (r.kind !== "stock" || r.aiba_score == null) continue;
    const { theme } = parseDomainId(r.domain_id);
    const arr = themeScores.get(theme) ?? [];
    arr.push(r.aiba_score);
    themeScores.set(theme, arr);
  }
  const themeAvg = new Map<string, number>();
  for (const [theme, scores] of themeScores) {
    if (scores.length > 0)
      themeAvg.set(theme, Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10);
  }
  for (const r of rows) {
    if (r.kind !== "stock") continue;
    const { theme } = parseDomainId(r.domain_id);
    const avg = themeAvg.get(theme);
    if (avg != null) r.peer_avg_aiba = avg;
  }

  return rows;
}

// 全ドメインの集計（重い）を 10 分キャッシュ。全ランキング系がこれを共有・再利用する。
const cachedAllRows = unstable_cache(buildAllRows, ["aiba-all-rows-v2"], { revalidate: CACHE_TTL, tags: ["aiba-data"] });

/** 指定地域・種別の最新ランキング。 */
export async function getRanking(region: Region, kind: Kind): Promise<RankingRow[]> {
  return (await cachedAllRows()).filter((r) => r.region === region && r.kind === kind);
}

/** 指定テーマ×地域の構成銘柄（業界ETF＋個別株）。業界ページ用。
 * global は地域横断：global ETF＋全地域の個別株を表示する。 */
export async function getIndustry(theme: string, region: Region): Promise<RankingRow[]> {
  const all = (await cachedAllRows()).filter((r) => parseDomainId(r.domain_id).theme === theme);
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

/**
 * 定点記録（スコアのスナップショット）。out-of-sample 検証用。全行ページング取得。
 * 2.2MB超のため unstable_cache の 2MB 上限を超える。ルートレベルの revalidate=600 でキャッシュ制御する。
 */
export async function getSnapshots(): Promise<SnapshotRow[]> {
  return selectAll<SnapshotRow>("score_snapshots",
    "snapshot_date,domain_id,is_buy,aiba_score,ret_1m,ret_3m,ret_6m,ret_12m");
}

export interface BenchmarkPoint { trade_date: string; close: number }

/** ベンチマーク指数の日次終値（単一ティッカー）。全行ページング取得。テーブル未作成時は空配列。 */
export async function getBenchmark(ticker = "ACWI"): Promise<BenchmarkPoint[]> {
  const rows = await selectAll<any>("benchmark_prices", "trade_date,close",
    (q) => q.eq("ticker", ticker).order("trade_date", { ascending: true }));
  return rows.map((r) => ({ trade_date: r.trade_date, close: Number(r.close) }));
}

export interface MarketMonthlyRow {
  index_name: string;
  sector: string;
  month: string;
  avg_return: number | null;
  median_return: number | null;
  best_ticker: string | null;
  best_return: number | null;
  worst_ticker: string | null;
  worst_return: number | null;
  ticker_count: number | null;
}

/** セクター別月次騰落率。market_summary_job.py が月1回更新。テーブル未作成時は空配列。 */
export async function getMarketMonthly(indexName: "sp500" | "topix"): Promise<MarketMonthlyRow[]> {
  return selectAll<MarketMonthlyRow>(
    "market_monthly",
    "index_name,sector,month,avg_return,median_return,best_ticker,best_return,worst_ticker,worst_return,ticker_count",
    (q) => q.eq("index_name", indexName).order("month", { ascending: true }),
  );
}

/** 複数ベンチマーク指数を一括取得。ticker → BenchmarkPoint[] の Map を返す。 */
export async function getAllBenchmarks(
  tickers = ["ACWI", "QQQ", "ARKK", "BUZZ"],
): Promise<Map<string, BenchmarkPoint[]>> {
  const rows = await selectAll<any>("benchmark_prices", "trade_date,ticker,close",
    (q) => q.in("ticker", tickers).order("trade_date", { ascending: true }));
  const out = new Map<string, BenchmarkPoint[]>();
  for (const r of rows) {
    const arr = out.get(r.ticker) ?? [];
    arr.push({ trade_date: r.trade_date, close: Number(r.close) });
    out.set(r.ticker, arr);
  }
  return out;
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

/**
 * シミュレータ・ゲーム用の週次ラウンド日付リスト。
 * daily_metrics から基準銘柄(NVDA)の全取引日を取得し、5営業日ごとに間引いて返す（≈週1回）。
 * 結果は昇順で約200〜220件（2022-01〜現在）。10分キャッシュ。
 */
export const getWeeklyRoundDates = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await selectAll<{ trade_date: string }>(
      "daily_metrics",
      "trade_date",
      (q) =>
        q
          .eq("domain_id", "advanced_semiconductor_us_nvda")
          .gte("trade_date", "2022-01-01")
          .not("aiba_score", "is", null)
          .order("trade_date", { ascending: true }),
    );
    const allDates = rows.map((r) => r.trade_date);
    return allDates.filter((_, i) => (i + 1) % 5 === 0);
  },
  ["aiba-sim-round-dates-v1"],
  { revalidate: CACHE_TTL, tags: ["aiba-data"] },
);

/** テーマ別ニュース論調（GDELT平均トーン）。テーブル未作成でも空Mapで安全。10分キャッシュ。 */
export const getThemeTone = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data, error } = await supabase.from("theme_news_tone").select("theme_id,tone");
    if (error) return {};
    const out: Record<string, number> = {};
    for (const r of data ?? []) if ((r as any).tone != null) out[(r as any).theme_id] = Number((r as any).tone);
    return out;
  },
  ["aiba-theme-tone-v2"], { revalidate: CACHE_TTL, tags: ["aiba-data"] },
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

export interface FullFundamentals {
  revenue_growth: number | null; eps_growth: number | null; forward_pe: number | null;
  operating_margin: number | null; roe: number | null; debt_to_equity: number | null;
  current_ratio: number | null; free_cashflow: number | null; market_cap: number | null;
}
/** ticker → 全ファンダ（未来GAFAM/品質スコア用）。10分キャッシュ。列未マイグレーションでも安全。 */
export const getFundamentalsFull = unstable_cache(
  async (): Promise<Record<string, FullFundamentals>> => {
    // select("*") で未マイグレーション列（market_cap 等）があっても壊れないように。
    const { data, error } = await supabase.from("ticker_fundamentals").select("*");
    const map: Record<string, FullFundamentals> = {};
    if (error) return map;
    const num = (v: any) => (v != null ? Number(v) : null);
    for (const r of data ?? []) {
      map[(r as any).ticker] = {
        revenue_growth: num((r as any).revenue_growth), eps_growth: num((r as any).eps_growth),
        forward_pe: num((r as any).forward_pe), operating_margin: num((r as any).operating_margin),
        roe: num((r as any).roe), debt_to_equity: num((r as any).debt_to_equity),
        current_ratio: num((r as any).current_ratio), free_cashflow: num((r as any).free_cashflow),
        market_cap: num((r as any).market_cap),
      };
    }
    return map;
  },
  ["aiba-fundamentals-full-v2"], { revalidate: CACHE_TTL, tags: ["aiba-data"] },
);

/** Pickup: 地域・種別を問わず「今買い」候補（AIBA≥閾値 or 乖離）をAIBA順で。 */
export async function getPickup(): Promise<RankingRow[]> {
  return (await cachedAllRows())
    .filter((r) => (r.aiba_score ?? 0) >= BUY_LEVEL || r.divergence)
    .sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));
}

/** センチメント急騰ランキング：45日間のセンチメント上昇幅が大きい順。 */
export async function getSentimentSurge(limit = 30): Promise<RankingRow[]> {
  return (await cachedAllRows())
    .filter((r) => r.sentiment_trend > 0 && r.sentiment_score != null)
    .sort((a, b) => b.sentiment_trend - a.sentiment_trend)
    .slice(0, limit);
}

// ----------------------------- ハイパースケーラ CAPEX モニター -----------------------------

export interface EtfSentimentPoint {
  trade_date: string;
  cloud_infra: number | null;
  data_center: number | null;
  semiconductor: number | null;
}

const HYPERSCALER_ETF_IDS = [
  "cloud_infra_global_etf",
  "data_center_global_etf",
  "advanced_semiconductor_global_etf",
];

export const HYPERSCALER_STOCK_IDS = [
  // ハイパースケーラ本体
  "cloud_infra_us_amzn", "generative_ai_us_msft", "generative_ai_us_googl",
  // 半導体
  "advanced_semiconductor_us_nvda", "advanced_semiconductor_us_amd", "advanced_semiconductor_us_avgo",
  // DC機器・ネットワーク
  "cloud_infra_us_smci", "cloud_infra_us_anet",
  // クラウドSaaS
  "cloud_infra_us_snow", "cloud_infra_us_ddog", "cloud_infra_us_net",
] as const;

export interface HyperscalerData {
  etfHistory: EtfSentimentPoint[];
  stocks: RankingRow[];
}

export interface CapexPoint {
  quarter: string;           // 四半期末日 "YYYY-MM-DD"
  AMZN: number | null;       // 単位: 十億ドル (B)
  MSFT: number | null;
  GOOGL: number | null;
  META: number | null;
}

/** ハイパースケーラ四半期CAPEX推移。テーブル未作成時は空配列。 */
export async function getHyperscalerCapex(): Promise<CapexPoint[]> {
  const rows = await selectAll<any>(
    "hyperscaler_capex", "ticker,quarter,capex_usd",
    (q) => q.order("quarter", { ascending: true }),
  );
  if (rows.length === 0) return [];

  const qMap = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const entry = qMap.get(r.quarter) ?? {};
    entry[r.ticker] = Math.round((Number(r.capex_usd) / 1e9) * 10) / 10; // → 十億ドル (1桁)
    qMap.set(r.quarter, entry);
  }

  return [...qMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, d]) => ({
      quarter,
      AMZN: d.AMZN ?? null,
      MSFT: d.MSFT ?? null,
      GOOGL: d.GOOGL ?? null,
      META: d.META ?? null,
    }));
}

/** ハイパースケーラCAPEXモニター用データ。ETF研究熱量推移＋恩恵銘柄スコア。 */
export async function getHyperscalerData(): Promise<HyperscalerData> {
  const cutoff = new Date(Date.now() - 380 * 86_400_000).toISOString().slice(0, 10);

  const [metrics, allRows] = await Promise.all([
    selectAll<any>("daily_metrics", "domain_id,trade_date,sentiment_score",
      (q) => q.in("domain_id", HYPERSCALER_ETF_IDS)
               .gte("trade_date", cutoff)
               .order("trade_date", { ascending: true })),
    cachedAllRows(),
  ]);

  // 日付ごとにETF3本のセンチメントをマージ
  const dateMap = new Map<string, { cloud_infra: number | null; data_center: number | null; semiconductor: number | null }>();
  for (const m of metrics) {
    const row = dateMap.get(m.trade_date) ?? { cloud_infra: null, data_center: null, semiconductor: null };
    if (m.domain_id === "cloud_infra_global_etf") row.cloud_infra = m.sentiment_score;
    if (m.domain_id === "data_center_global_etf") row.data_center = m.sentiment_score;
    if (m.domain_id === "advanced_semiconductor_global_etf") row.semiconductor = m.sentiment_score;
    dateMap.set(m.trade_date, row);
  }

  // 週次サンプリング（5営業日ごと）でデータ量を削減
  const allDates = [...dateMap.keys()].sort();
  const etfHistory: EtfSentimentPoint[] = allDates
    .filter((_, i) => i % 5 === 0 || i === allDates.length - 1)
    .map((d) => ({ trade_date: d, ...dateMap.get(d)! }));

  const stockIdSet = new Set<string>(HYPERSCALER_STOCK_IDS);
  const stocks = allRows.filter((r) => stockIdSet.has(r.domain_id));

  return { etfHistory, stocks };
}

export interface TopicStats {
  shortBuyCount: number;
  midBuyCount: number;
  longBuyCount: number;
  allBuyCount: number;
  twoBuyCount: number;
  gcActiveCount: number;
  gcNearCount: number;
}

const isShortBuy = (r: RankingRow) => (r.ma_deviation ?? -1) > 0;
const isMidBuy = (r: RankingRow) => (r.aiba_score ?? 0) >= 60;
const isLongBuy = (r: RankingRow) => r.ma200_deviation !== null && (r.ma200_deviation ?? -1) > 0;

/**
 * 25日線 vs 75日線のゴールデンクロス状態を返す。
 * ratio = MA25/MA75 = (1 + ma75Dev/100) / (1 + ma25Dev/100)
 * "gc"      = 1.00 ≤ ratio ≤ 1.05（クロスして間もない・差5%以内）
 * "near_gc" = 0.97 < ratio < 1.00（75日線まで3%以内・接近中）
 * null      = ratio > 1.05（差が開きすぎ）または ratio ≤ 0.97（遠い）
 */
export function gcSignal(ma25Dev: number | null, ma75Dev: number | null): "gc" | "near_gc" | null {
  if (ma25Dev == null || ma75Dev == null) return null;
  const ratio = (1 + ma75Dev / 100) / (1 + ma25Dev / 100);
  if (ratio >= 1.0 && ratio <= 1.05) return "gc";
  if (ratio > 0.97 && ratio < 1.0) return "near_gc";
  return null;
}

/** トピック（短中長期 全力買い + GC）用データ。 */
export async function getTopicRows(): Promise<{
  allBuy: RankingRow[];
  twoBuy: RankingRow[];
  gcActive: RankingRow[];
  gcNear: RankingRow[];
  stats: TopicStats;
}> {
  const rows = await cachedAllRows();

  const allBuy = rows
    .filter((r) => isShortBuy(r) && isMidBuy(r) && isLongBuy(r))
    .sort((a, b) => b.momentum_score - a.momentum_score);

  const twoBuy = rows
    .filter((r) => {
      if (isShortBuy(r) && isMidBuy(r) && isLongBuy(r)) return false;
      const n = (isShortBuy(r) ? 1 : 0) + (isMidBuy(r) ? 1 : 0) + (isLongBuy(r) ? 1 : 0);
      return n === 2;
    })
    .sort((a, b) => b.momentum_score - a.momentum_score)
    .slice(0, 40);

  const gcActive = rows
    .filter((r) => gcSignal(r.ma_deviation, r.ma75_deviation) === "gc")
    .sort((a, b) => b.momentum_score - a.momentum_score);

  const gcNear = rows
    .filter((r) => gcSignal(r.ma_deviation, r.ma75_deviation) === "near_gc")
    .sort((a, b) => {
      // 75日線に最も近い順（ratio が 1 に近い順）
      const ra = (1 + (a.ma75_deviation ?? 0) / 100) / (1 + (a.ma_deviation ?? 0) / 100);
      const rb = (1 + (b.ma75_deviation ?? 0) / 100) / (1 + (b.ma_deviation ?? 0) / 100);
      return rb - ra;
    });

  return {
    allBuy,
    twoBuy,
    gcActive,
    gcNear,
    stats: {
      shortBuyCount: rows.filter(isShortBuy).length,
      midBuyCount: rows.filter(isMidBuy).length,
      longBuyCount: rows.filter(isLongBuy).length,
      allBuyCount: allBuy.length,
      twoBuyCount: twoBuy.length,
      gcActiveCount: gcActive.length,
      gcNearCount: gcNear.length,
    },
  };
}
