import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MetricHistoryRow } from "@/lib/types";
import TrendChart from "@/components/TrendChart";
import { fmt } from "@/lib/score-color";

export const revalidate = 0;

async function getHistory(id: string) {
  const { data: dom } = await supabase
    .from("domains")
    .select("name,ticker,layer")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("daily_metrics")
    .select("trade_date,aiba_score,technical_score,sentiment_score,rsi_14,close_price")
    .eq("domain_id", id)
    .order("trade_date", { ascending: true })
    .limit(180);

  if (error) console.error("history fetch error:", error.message);
  return { dom, history: (data ?? []) as MetricHistoryRow[] };
}

export default async function DomainPage({ params }: { params: { id: string } }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <Link className="back-link" href="/">← 戻る</Link>
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const { dom, history } = await getHistory(params.id);
  const latest = history[history.length - 1];

  return (
    <main className="container">
      <Link className="back-link" href="/">← ランキングへ戻る</Link>
      <header className="header" style={{ marginTop: 12 }}>
        <h1>
          {dom?.name ?? params.id}
          <span className="ticker">{dom?.ticker}</span>
        </h1>
        {latest && (
          <p>
            最新 AIBAスコア <span className="date">{fmt(latest.aiba_score)}</span>
            ／ テクニカル {fmt(latest.technical_score)} ／ センチメント {fmt(latest.sentiment_score)}
            ／ RSI {fmt(latest.rsi_14)}（{latest.trade_date}）
          </p>
        )}
      </header>

      {history.length === 0 ? (
        <div className="notice">この領域の時系列データがまだありません。</div>
      ) : (
        <TrendChart data={history} />
      )}
    </main>
  );
}
