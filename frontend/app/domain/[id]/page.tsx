import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MetricHistoryRow } from "@/lib/types";
import TrendChart from "@/components/TrendChart";
import { fmt } from "@/lib/score-color";
import { parseDomainId, REGION_LABEL, REGION_PATH } from "@/lib/regions";

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

  const { data: predData } = await supabase
    .from("predictions")
    .select("as_of_date,horizon_days,pred_aiba,buyzone_prob")
    .eq("domain_id", id)
    .order("as_of_date", { ascending: false })
    .limit(1);
  const prediction = predData?.[0] ?? null;

  return { dom, history: (data ?? []) as MetricHistoryRow[], prediction };
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

  const { dom, history, prediction } = await getHistory(params.id);
  const latest = history[history.length - 1];
  const { region } = parseDomainId(params.id);

  return (
    <main className="container">
      <Link className="back-link" href={REGION_PATH[region]}>← {REGION_LABEL[region]}のランキングへ戻る</Link>
      <header className="header" style={{ marginTop: 12 }}>
        <h1>
          {dom?.name ?? params.id}
          <span className="ticker">{dom?.ticker}</span>
          <span className="region-badge">{REGION_LABEL[region]}</span>
        </h1>
        {latest && (
          <p>
            最新 AIBAスコア <span className="date">{fmt(latest.aiba_score)}</span>
            ／ テクニカル {fmt(latest.technical_score)} ／ センチメント {fmt(latest.sentiment_score)}
            ／ RSI {fmt(latest.rsi_14)}（{latest.trade_date}）
          </p>
        )}
        {prediction && (
          <p className="forecast-line">
            🔮 1ヶ月先予測：買い場入り確率{" "}
            <span className="date">{Math.round((prediction.buyzone_prob ?? 0) * 100)}%</span>
            {" / "}予測AIBAスコア <span className="date">{fmt(prediction.pred_aiba)}</span>
            <span className="forecast-note">（{prediction.horizon_days}営業日先・平均回帰＋確率モデル）</span>
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
