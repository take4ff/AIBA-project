import { supabase } from "./supabase";
import { RankingRow } from "./types";
import { Region, parseDomainId } from "./regions";

// 各市場の休場日を見込み、直近この日数から最新行を拾う
const LOOKBACK_DAYS = 25;

function cutoffDate(): string {
  const d = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** 指定地域の最新ランキング（ドメインごとの最新日を採用）を返す。 */
export async function getRanking(region: Region): Promise<RankingRow[]> {
  const [domainsRes, metricsRes] = await Promise.all([
    supabase.from("domains").select("id,name,layer,ticker"),
    supabase
      .from("daily_metrics")
      .select(
        "domain_id,trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation,close_price"
      )
      .gte("trade_date", cutoffDate()),
  ]);

  if (domainsRes.error || metricsRes.error) {
    console.error("ranking fetch error:", domainsRes.error?.message, metricsRes.error?.message);
    return [];
  }

  // ドメインごとに最新の trade_date の行を採用
  const latest = new Map<string, any>();
  for (const m of metricsRes.data ?? []) {
    const cur = latest.get(m.domain_id);
    if (!cur || m.trade_date > cur.trade_date) latest.set(m.domain_id, m);
  }

  const domMap = new Map((domainsRes.data ?? []).map((d) => [d.id, d]));
  const rows: RankingRow[] = [];
  for (const [id, m] of latest) {
    const d = domMap.get(id);
    if (!d) continue;
    const { region: r } = parseDomainId(id);
    if (r !== region) continue;
    rows.push({
      layer: d.layer,
      region: r,
      domain_id: id,
      domain_name: d.name,
      ticker: d.ticker,
      trade_date: m.trade_date,
      aiba_score: m.aiba_score,
      technical_score: m.technical_score,
      sentiment_score: m.sentiment_score,
      rsi_14: m.rsi_14,
      ma_deviation: m.ma_deviation,
      close_price: m.close_price,
    });
  }
  return rows;
}
