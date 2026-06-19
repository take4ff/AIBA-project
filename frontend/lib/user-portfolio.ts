"use client";

import { supabaseBrowser } from "@/lib/supabase-browser";

export interface UserHolding {
  ticker: string;            // 個別株/ETFはそのティッカー。投信は代用ETF/指数のティッカー
  name: string | null;
  currency: "JPY" | "USD";
  avg_cost: number | null;
  shares: number | null;     // 株数（投信のときは口数・任意）
  is_fund?: boolean;         // 投信フラグ
  acquired_on?: string | null;  // 取得日（投信の評価に使用）
  principal?: number | null;    // 取得額（投信の投資元本）
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
    .select("ticker,name,currency,avg_cost,shares,is_fund,acquired_on,principal")
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
    is_fund: h.is_fund ?? false,
    acquired_on: h.acquired_on ?? null,
    principal: h.principal ?? null,
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

  // ticker_metrics（日次バッチ生成・翌営業日反映）が未生成の銘柄は、
  // ユニバースに存在すれば daily_metrics から即時補完する（追加直後でもスコア表示）。
  const missing = tickers.filter((t) => !metrics.has(t));
  if (missing.length) {
    const { data: doms } = await supabaseBrowser.from("domains").select("id,ticker").in("ticker", missing);
    const tickerByDomain = new Map<string, string>();
    for (const d of doms ?? []) tickerByDomain.set((d as any).id, (d as any).ticker);
    const domainIds = [...tickerByDomain.keys()];
    if (domainIds.length) {
      const { data: dm } = await supabaseBrowser.from("daily_metrics")
        .select("domain_id,trade_date,close_price,rsi_14,ma_deviation,technical_score")
        .in("domain_id", domainIds).gte("trade_date", cutoff);
      const latest = new Map<string, any>();
      for (const r of dm ?? []) {
        const cur = latest.get(r.domain_id);
        if (!cur || r.trade_date > cur.trade_date) latest.set(r.domain_id, r);
      }
      for (const [domId, r] of latest) {
        const tk = tickerByDomain.get(domId)!;
        const cur = metrics.get(tk);
        if (cur && cur.trade_date >= r.trade_date) continue;  // ticker側が新しければ尊重
        metrics.set(tk, {
          ticker: tk, trade_date: r.trade_date, close_price: r.close_price,
          rsi_14: r.rsi_14, ma_deviation: r.ma_deviation,
          overheat: r.technical_score != null ? Math.round((100 - r.technical_score) * 100) / 100 : null,
        });
      }
    }
  }

  const funds = new Map<string, TickerFundamentals>();
  for (const r of (f ?? []) as TickerFundamentals[]) funds.set(r.ticker, r);
  return { metrics, funds };
}

/**
 * 投信の取得日における代用ETFの終値を取得（取得日以前で最も新しい終値）。
 * ticker_metrics（保有ティッカーの履歴）を優先し、無ければ daily_metrics（ユニバース）で補完。
 * 返り値: 代用ticker → 取得日終値。これと最新終値の比でリターンを概算する。
 */
export async function getFundAcqCloses(
  funds: { ticker: string; acquired_on: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (funds.length === 0) return out;
  const tickers = [...new Set(funds.map((f) => f.ticker))];
  const minDate = funds.reduce((a, f) => (f.acquired_on < a ? f.acquired_on : a), funds[0].acquired_on);

  // 1) ticker_metrics（代用ETFの履歴）
  const byTicker = new Map<string, { d: string; c: number }[]>();
  const { data: tm } = await supabaseBrowser.from("ticker_metrics")
    .select("ticker,trade_date,close_price").in("ticker", tickers).gte("trade_date", minDate);
  for (const r of tm ?? []) {
    if ((r as any).close_price == null) continue;
    const arr = byTicker.get((r as any).ticker) ?? [];
    arr.push({ d: (r as any).trade_date, c: Number((r as any).close_price) });
    byTicker.set((r as any).ticker, arr);
  }
  // 2) ユニバースの daily_metrics で不足分を補完
  const missing = tickers.filter((t) => !byTicker.has(t));
  if (missing.length) {
    const { data: doms } = await supabaseBrowser.from("domains").select("id,ticker").in("ticker", missing);
    const tickerByDomain = new Map<string, string>();
    for (const d of doms ?? []) tickerByDomain.set((d as any).id, (d as any).ticker);
    if (tickerByDomain.size) {
      const { data: dm } = await supabaseBrowser.from("daily_metrics")
        .select("domain_id,trade_date,close_price").in("domain_id", [...tickerByDomain.keys()]).gte("trade_date", minDate);
      for (const r of dm ?? []) {
        if ((r as any).close_price == null) continue;
        const tk = tickerByDomain.get((r as any).domain_id)!;
        const arr = byTicker.get(tk) ?? [];
        arr.push({ d: (r as any).trade_date, c: Number((r as any).close_price) });
        byTicker.set(tk, arr);
      }
    }
  }
  // 取得日以前で最も新しい終値を選ぶ
  for (const f of funds) {
    const arr = (byTicker.get(f.ticker) ?? []).filter((x) => x.d <= f.acquired_on).sort((a, b) => (a.d < b.d ? 1 : -1));
    if (arr.length) out.set(f.ticker, arr[0].c);
  }
  return out;
}

/** ticker → テーマ（slug/表示名）・地域。ユニバース外は未登録。配分分析用。 */
export async function getTickerThemes(): Promise<Map<string, { theme: string; label: string; region: string; name: string }>> {
  const { parseDomainId } = await import("@/lib/regions");
  const { data } = await supabaseBrowser.from("domains").select("id,ticker,name");
  // テーマ表示名は global ETF の名称を採用
  const labelByTheme = new Map<string, string>();
  for (const d of data ?? []) {
    const p = parseDomainId((d as any).id);
    if (p.region === "global" && p.kind === "etf") labelByTheme.set(p.theme, (d as any).name);
  }
  const map = new Map<string, { theme: string; label: string; region: string; name: string }>();
  for (const d of data ?? []) {
    const t = (d as any).ticker as string | null;
    if (!t) continue;
    const p = parseDomainId((d as any).id);
    // 個別株の社名を優先（ETFしか無ければそれ）
    const prev = map.get(t);
    if (!prev || (p.kind === "stock")) {
      map.set(t, {
        theme: p.theme, label: labelByTheme.get(p.theme) ?? p.theme, region: p.region,
        name: (d as any).name ?? t,
      });
    }
  }
  return map;
}

export async function getTickerHistory(ticker: string): Promise<TickerMetric[]> {
  const { data } = await supabaseBrowser.from("ticker_metrics")
    .select("ticker,trade_date,close_price,rsi_14,ma_deviation,overheat")
    .eq("ticker", ticker).order("trade_date", { ascending: false }).limit(1000);
  return ((data ?? []) as TickerMetric[]).reverse();   // 最新分を昇順に戻す
}
