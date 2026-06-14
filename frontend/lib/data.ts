import { supabase } from "./supabase";
import { RankingRow } from "./types";
import { Region, Kind, parseDomainId } from "./regions";

// 最新行＋センチメントの傾き算出のため、直近この日数を取得
const LOOKBACK_DAYS = 45;

function cutoffDate(): string {
  const d = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** 指定地域・種別の最新ランキング（ドメインごとの最新日を採用）を返す。 */
export async function getRanking(region: Region, kind: Kind): Promise<RankingRow[]> {
  const [domainsRes, metricsRes, predRes] = await Promise.all([
    supabase.from("domains").select("id,name,layer,ticker"),
    supabase
      .from("daily_metrics")
      .select(
        "domain_id,trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation,close_price"
      )
      .gte("trade_date", cutoffDate()),
    supabase
      .from("predictions")
      .select("domain_id,as_of_date,buyzone_prob,pred_aiba")
      .gte("as_of_date", cutoffDate()),
  ]);

  if (domainsRes.error || metricsRes.error) {
    console.error("ranking fetch error:", domainsRes.error?.message, metricsRes.error?.message);
    return [];
  }

  // ドメインごとに最新の予測を採用（predictions テーブルが未作成でも動作）
  const pred = new Map<string, any>();
  for (const p of predRes.data ?? []) {
    const cur = pred.get(p.domain_id);
    if (!cur || p.as_of_date > cur.as_of_date) pred.set(p.domain_id, p);
  }

  const domainsData = domainsRes.data ?? [];
  // テーマ表示名は global の業界ETF行の name を正とする
  const themeName = new Map<string, string>();
  for (const d of domainsData) {
    const p = parseDomainId(d.id);
    if (p.region === "global" && p.kind === "etf") themeName.set(p.theme, d.name);
  }

  // ドメインごとに最新行と、期間内で最古のセンチメント（傾き算出用）を採用
  const latest = new Map<string, any>();
  const firstSent = new Map<string, { trade_date: string; sentiment_score: number | null }>();
  for (const m of metricsRes.data ?? []) {
    const cur = latest.get(m.domain_id);
    if (!cur || m.trade_date > cur.trade_date) latest.set(m.domain_id, m);
    const f = firstSent.get(m.domain_id);
    if (!f || m.trade_date < f.trade_date) firstSent.set(m.domain_id, m);
  }

  const clamp = (x: number) => Math.max(0, Math.min(100, x));

  // 並び順を業界で揃える：その地域の業界ETFスコアを theme ごとに保持
  const etfScoreByTheme = new Map<string, number>();
  for (const [id, m] of latest) {
    const p = parseDomainId(id);
    if (p.region === region && p.kind === "etf") {
      etfScoreByTheme.set(p.theme, m.aiba_score ?? -1);
    }
  }

  const domMap = new Map(domainsData.map((d) => [d.id, d]));
  const rows: RankingRow[] = [];
  for (const [id, m] of latest) {
    const d = domMap.get(id);
    if (!d) continue;
    const p = parseDomainId(id);
    if (p.region !== region || p.kind !== kind) continue;

    // センチメントの傾き（期間内の最古→最新の変化）と「成長×割安」合成スコア
    const sentNow = m.sentiment_score ?? 50;
    const sentPast = firstSent.get(id)?.sentiment_score ?? sentNow;
    const sentimentTrend = Math.round((sentNow - sentPast) * 10) / 10;
    const sentMomentum = clamp(50 + sentimentTrend * 3); // 熱量上昇を0-100へ
    const aiba = m.aiba_score ?? 0;
    const comboScore = Math.round(0.5 * aiba + 0.5 * sentMomentum);

    rows.push({
      order_key: etfScoreByTheme.get(p.theme) ?? (m.aiba_score ?? 0),
      sentiment_trend: sentimentTrend,
      combo_score: comboScore,
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
    });
  }
  return rows;
}
