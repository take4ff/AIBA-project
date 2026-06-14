import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MetricHistoryRow } from "@/lib/types";
import TrendChart from "@/components/TrendChart";
import { fmt } from "@/lib/score-color";
import { parseDomainId, REGION_LABEL, REGION_PATH } from "@/lib/regions";
import { bollinger, macdState, macdLabel, buyGuide } from "@/lib/indicators";
import { money } from "@/lib/sell-signal";

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

  // 個別株は対応する業界ETFのAIBAを比較用に取得
  const { theme, region, kind } = parseDomainId(id);
  let compare: { name: string; ticker: string; aibaByDate: Record<string, number> } | null = null;
  if (kind === "stock") {
    const etfId = `${theme}_${region}_etf`;
    const { data: etfDom } = await supabase
      .from("domains").select("name,ticker").eq("id", etfId).single();
    const { data: etfHist } = await supabase
      .from("daily_metrics").select("trade_date,aiba_score")
      .eq("domain_id", etfId).order("trade_date", { ascending: true }).limit(180);
    if (etfDom) {
      const aibaByDate: Record<string, number> = {};
      for (const r of etfHist ?? []) if (r.aiba_score != null) aibaByDate[r.trade_date] = Number(r.aiba_score);
      compare = { name: etfDom.name, ticker: etfDom.ticker, aibaByDate };
    }
  }

  const { data: predData } = await supabase
    .from("predictions")
    .select("as_of_date,horizon_days,pred_aiba,buyzone_prob")
    .eq("domain_id", id)
    .order("as_of_date", { ascending: false })
    .limit(1);
  const prediction = predData?.[0] ?? null;

  return { dom, history: (data ?? []) as MetricHistoryRow[], prediction, compare };
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

  const { dom, history, prediction, compare } = await getHistory(params.id);
  const latest = history[history.length - 1];
  const { region } = parseDomainId(params.id);

  // 補助テクニカル（表示のみ）: ボリンジャーバンドを重ね、MACD状態を表示
  const closes = history.map((h) => h.close_price);
  const bb = bollinger(closes);
  const chartData = history.map((h, i) => ({
    ...h,
    bb_upper: bb.upper[i],
    bb_lower: bb.lower[i],
    etf_aiba: compare?.aibaByDate[h.trade_date] ?? null,
  }));
  const macd = macdState(closes);
  const guide = buyGuide(closes);
  const cur = region === "jp" ? "JPY" : "USD";

  // 個別株 vs 業界ETF の比較
  const etfAiba = compare && latest ? compare.aibaByDate[latest.trade_date] ?? null : null;
  const stockAiba = latest?.aiba_score ?? null;
  const vsDelta = etfAiba != null && stockAiba != null ? stockAiba - etfAiba : null;

  return (
    <main className="container">
      <header className="header">
        <Link className="back-link" href={REGION_PATH[region]}>← {REGION_LABEL[region]}のランキングへ戻る</Link>
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

      {compare && vsDelta != null && (
        <p className="forecast-line">
          ⚖️ 業界比較：この銘柄 AIBA {fmt(stockAiba)} vs 業界ETF {compare.ticker} {fmt(etfAiba)} →{" "}
          <span style={{ color: vsDelta >= 0 ? "#15a34a" : "#dc2626", fontWeight: 700 }}>
            {vsDelta >= 0 ? `業界より割安（+${vsDelta.toFixed(0)}）` : `業界より割高/過熱（${vsDelta.toFixed(0)}）`}
          </span>
        </p>
      )}
      {guide.fair != null && (
        <p className="forecast-line">
          🎯 購入目安：妥当値(25日MA) <span className="date">{money(guide.fair, cur)}</span>
          {" / "}押し目買い目安 <span style={{ color: "#15a34a", fontWeight: 700 }}>{money(guide.pullback, cur)}</span>
          {" / "}下値支持(60日安値) {money(guide.support, cur)}
          <span className="forecast-note">（現在 {money(guide.current, cur)}）</span>
        </p>
      )}
      {history.length > 0 && (
        <p className="forecast-line" style={{ marginTop: 0 }}>📉 MACD：{macdLabel(macd)}　／　チャートの青破線＝ボリンジャーバンド(20,2σ)</p>
      )}
      {history.length === 0 ? (
        <div className="notice">この領域の時系列データがまだありません。</div>
      ) : (
        <TrendChart data={chartData} currency={cur} etfCompare={!!compare} buyLevel={guide.pullback} />
      )}
    </main>
  );
}
