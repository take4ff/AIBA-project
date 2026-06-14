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

/** Pickup: 地域・種別を問わず「今買い」候補（AIBA≥閾値 or 乖離）をAIBA順で。 */
export async function getPickup(): Promise<RankingRow[]> {
  return (await buildAllRows())
    .filter((r) => (r.aiba_score ?? 0) >= BUY_LEVEL || r.divergence)
    .sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));
}
