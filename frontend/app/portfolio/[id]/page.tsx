import Link from "next/link";
import { getHolding } from "@/lib/portfolio";
import { isSupabaseConfigured } from "@/lib/supabase";
import SellChart from "@/components/SellChart";
import { sellBadge, money, pct } from "@/lib/sell-signal";

export const revalidate = 0;

export default async function HoldingPage({ params }: { params: { id: string } }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <Link className="back-link" href="/portfolio">← ポートフォリオへ</Link>
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const { holding, history } = await getHolding(params.id);
  const latest = history[history.length - 1];
  const close = latest?.close_price ?? null;
  const returnPct =
    holding?.kind === "direct" && holding.avg_cost && close
      ? ((close - holding.avg_cost) / holding.avg_cost) * 100
      : null;
  const badge = sellBadge(latest?.overheat ?? null);
  const currency = holding?.currency ?? "JPY";

  return (
    <main className="container">
      <Link className="back-link" href="/portfolio">← ポートフォリオへ</Link>
      <header className="header" style={{ marginTop: 12 }}>
        <h1>
          {holding?.name ?? params.id}
          <span className="ticker">{holding?.ticker}</span>
          <span className={`sell-badge ${badge.cls}`} style={{ marginLeft: 10 }}>{badge.label}</span>
        </h1>
        {latest && (
          <p>
            現在値 <span className="date">{money(close, currency)}</span>
            {holding?.avg_cost != null && <>／ 取得単価 {money(holding.avg_cost, currency)}</>}
            {returnPct != null && (
              <>／ 損益 <span style={{ color: returnPct >= 0 ? "#34d399" : "#ef4444", fontWeight: 700 }}>{pct(returnPct)}</span></>
            )}
            {latest.overheat != null && <>／ 過熱度 {Math.round(latest.overheat)}</>}
            （{latest.trade_date}）
          </p>
        )}
        {holding?.note && <p className="forecast-note">{holding.note}</p>}
      </header>

      {history.length === 0 ? (
        <div className="notice">時系列データがまだありません。</div>
      ) : (
        <SellChart data={history} currency={currency} />
      )}
    </main>
  );
}
