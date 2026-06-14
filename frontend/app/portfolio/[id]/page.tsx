"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getTickerHistory, TickerMetric } from "@/lib/user-portfolio";
import SellChart from "@/components/SellChart";
import { sellBadge, money, pct } from "@/lib/sell-signal";

export default function HoldingPage({ params }: { params: { id: string } }) {
  const ticker = decodeURIComponent(params.id);
  const { user, ready } = useAuth();
  const [history, setHistory] = useState<TickerMetric[]>([]);
  const [holding, setHolding] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const [{ data: h }, hist] = await Promise.all([
        supabaseBrowser.from("user_holdings").select("*").eq("ticker", ticker).maybeSingle(),
        getTickerHistory(ticker),
      ]);
      setHolding(h);
      setHistory(hist);
      setLoading(false);
    })();
  }, [user, ticker]);

  const latest = history[history.length - 1];
  const close = latest?.close_price ?? null;
  const currency = (holding?.currency ?? "JPY") as "JPY" | "USD";
  const ret = holding?.avg_cost && close ? ((close - holding.avg_cost) / holding.avg_cost) * 100 : null;
  const badge = sellBadge(latest?.overheat ?? null);
  const chartData = history.map((m) => ({
    trade_date: m.trade_date, close_price: m.close_price, rsi_14: m.rsi_14, overheat: m.overheat,
  }));

  return (
    <main className="container">
      <header className="header">
        <Link className="back-link" href="/portfolio">← ポートフォリオへ</Link>
        <h1>
          {holding?.name ?? ticker}
          <span className="ticker">{ticker}</span>
          <span className={`sell-badge ${badge.cls}`} style={{ marginLeft: 10 }}>{badge.label}</span>
        </h1>
        {latest && (
          <p>
            現在値 <span className="date">{money(close, currency)}</span>
            {holding?.avg_cost != null && <>／ 取得単価 {money(holding.avg_cost, currency)}</>}
            {ret != null && <>／ 損益 <span style={{ color: ret >= 0 ? "#15a34a" : "#dc2626", fontWeight: 700 }}>{pct(ret)}</span></>}
            {latest.overheat != null && <>／ 過熱度 {Math.round(latest.overheat)}</>}
            （{latest.trade_date}）
          </p>
        )}
      </header>

      {!ready || loading ? (
        <div className="notice">読み込み中…</div>
      ) : !user ? (
        <div className="notice"><Link className="back-link" href="/login">ログイン</Link> が必要です。</div>
      ) : history.length === 0 ? (
        <div className="notice">指標データがまだありません（翌営業日の日次バッチで反映されます）。</div>
      ) : (
        <SellChart data={chartData} currency={currency} />
      )}
    </main>
  );
}
