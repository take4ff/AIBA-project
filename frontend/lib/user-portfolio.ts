"use client";

import { supabaseBrowser } from "@/lib/supabase-browser";

export interface UserHolding {
  ticker: string;
  name: string | null;
  currency: "JPY" | "USD";
  avg_cost: number | null;
  shares: number | null;
}

export interface TickerMetric {
  ticker: string;
  trade_date: string;
  close_price: number | null;
  rsi_14: number | null;
  ma_deviation: number | null;
  overheat: number | null;
}

export interface TickerFundamentals {
  ticker: string;
  quote_type: string | null;
  next_earnings_date: string | null;
  last_surprise_pct: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  eps_growth: number | null;
  revenue_growth: number | null;
}

export async function getHoldings(): Promise<UserHolding[]> {
  const { data } = await supabaseBrowser
    .from("user_holdings")
    .select("ticker,name,currency,avg_cost,shares")
    .order("created_at", { ascending: true });
  return (data ?? []) as UserHolding[];
}

export async function addHolding(h: UserHolding): Promise<string | null> {
  const { data: u } = await supabaseBrowser.auth.getUser();
  if (!u.user) return "ログインが必要です";
  const { error } = await supabaseBrowser.from("user_holdings").insert({
    user_id: u.user.id,
    ticker: h.ticker,
    name: h.name,
    currency: h.currency,
    avg_cost: h.avg_cost,
    shares: h.shares,
  });
  return error?.message ?? null;
}

export async function updateHolding(ticker: string, patch: Partial<UserHolding>): Promise<string | null> {
  const { error } = await supabaseBrowser.from("user_holdings").update(patch).eq("ticker", ticker);
  return error?.message ?? null;
}

export async function deleteHolding(ticker: string): Promise<void> {
  await supabaseBrowser.from("user_holdings").delete().eq("ticker", ticker);
}

/** 保有ティッカーの最新メトリクスとファンダを取得。 */
export async function getTickerData(tickers: string[]): Promise<{
  metrics: Map<string, TickerMetric>;
  funds: Map<string, TickerFundamentals>;
}> {
  if (tickers.length === 0) return { metrics: new Map(), funds: new Map() };
  const cutoff = new Date(Date.now() - 25 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: m }, { data: f }] = await Promise.all([
    supabaseBrowser.from("ticker_metrics")
      .select("ticker,trade_date,close_price,rsi_14,ma_deviation,overheat")
      .in("ticker", tickers).gte("trade_date", cutoff),
    supabaseBrowser.from("ticker_fundamentals").select("*").in("ticker", tickers),
  ]);
  const metrics = new Map<string, TickerMetric>();
  for (const r of (m ?? []) as TickerMetric[]) {
    const cur = metrics.get(r.ticker);
    if (!cur || r.trade_date > cur.trade_date) metrics.set(r.ticker, r);
  }
  const funds = new Map<string, TickerFundamentals>();
  for (const r of (f ?? []) as TickerFundamentals[]) funds.set(r.ticker, r);
  return { metrics, funds };
}

/** ticker → テーマ（slug/表示名）・地域。ユニバース外は未登録。配分分析用。 */
export async function getTickerThemes(): Promise<Map<string, { theme: string; label: string; region: string }>> {
  const { parseDomainId } = await import("@/lib/regions");
  const { data } = await supabaseBrowser.from("domains").select("id,ticker,name");
  // テーマ表示名は global ETF の名称を採用
  const labelByTheme = new Map<string, string>();
  for (const d of data ?? []) {
    const p = parseDomainId((d as any).id);
    if (p.region === "global" && p.kind === "etf") labelByTheme.set(p.theme, (d as any).name);
  }
  const map = new Map<string, { theme: string; label: string; region: string }>();
  for (const d of data ?? []) {
    const t = (d as any).ticker as string | null;
    if (!t) continue;
    const p = parseDomainId((d as any).id);
    if (!map.has(t)) map.set(t, { theme: p.theme, label: labelByTheme.get(p.theme) ?? p.theme, region: p.region });
  }
  return map;
}

export async function getTickerHistory(ticker: string): Promise<TickerMetric[]> {
  const { data } = await supabaseBrowser.from("ticker_metrics")
    .select("ticker,trade_date,close_price,rsi_14,ma_deviation,overheat")
    .eq("ticker", ticker).order("trade_date", { ascending: false }).limit(1000);
  return ((data ?? []) as TickerMetric[]).reverse();   // 最新分を昇順に戻す
}
