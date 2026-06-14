import { supabase } from "./supabase";

export interface Holding {
  id: string;
  name: string;
  ticker: string;
  currency: "JPY" | "USD";
  kind: "direct" | "proxy";
  avg_cost: number | null;
  note: string | null;
}

export interface PortfolioRow extends Holding {
  trade_date: string | null;
  close_price: number | null;
  rsi_14: number | null;
  ma_deviation: number | null;
  overheat: number | null;
  return_pct: number | null; // 取得単価比 [%]（direct のみ）
}

export interface SellMetricRow {
  trade_date: string;
  close_price: number | null;
  rsi_14: number | null;
  overheat: number | null;
}

const cutoff = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export async function getPortfolio(): Promise<PortfolioRow[]> {
  const [hRes, mRes] = await Promise.all([
    supabase.from("portfolio_holdings").select("*"),
    supabase
      .from("portfolio_metrics")
      .select("holding_id,trade_date,close_price,rsi_14,ma_deviation,overheat")
      .gte("trade_date", cutoff(20)),
  ]);
  if (hRes.error) {
    console.error("portfolio fetch error:", hRes.error.message);
    return [];
  }
  const latest = new Map<string, any>();
  for (const m of mRes.data ?? []) {
    const cur = latest.get(m.holding_id);
    if (!cur || m.trade_date > cur.trade_date) latest.set(m.holding_id, m);
  }
  return (hRes.data ?? []).map((h: any) => {
    const m = latest.get(h.id) ?? {};
    const close = m.close_price ?? null;
    const return_pct =
      h.kind === "direct" && h.avg_cost && close
        ? ((close - h.avg_cost) / h.avg_cost) * 100
        : null;
    return {
      ...h,
      trade_date: m.trade_date ?? null,
      close_price: close,
      rsi_14: m.rsi_14 ?? null,
      ma_deviation: m.ma_deviation ?? null,
      overheat: m.overheat ?? null,
      return_pct,
    } as PortfolioRow;
  });
}

export async function getHolding(id: string): Promise<{ holding: Holding | null; history: SellMetricRow[] }> {
  const { data: holding } = await supabase
    .from("portfolio_holdings").select("*").eq("id", id).single();
  const { data } = await supabase
    .from("portfolio_metrics")
    .select("trade_date,close_price,rsi_14,overheat")
    .eq("holding_id", id)
    .order("trade_date", { ascending: true })
    .limit(180);
  return { holding: (holding as Holding) ?? null, history: (data ?? []) as SellMetricRow[] };
}
