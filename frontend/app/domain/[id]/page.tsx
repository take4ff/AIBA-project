import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MetricHistoryRow } from "@/lib/types";
import TrendChart from "@/components/TrendChart";
import { fmt } from "@/lib/score-color";
import { parseDomainId, REGION_LABEL, REGION_PATH } from "@/lib/regions";
import { bollinger, macdState, macdLabel, buyGuide } from "@/lib/indicators";
import { money } from "@/lib/sell-signal";
import { interpretFundamentals, Fundamentals } from "@/lib/fundamentals";
import HealthRadar, { RadarPoint } from "@/components/HealthRadar";
import { narrative } from "@/lib/narrative";

export const revalidate = 0;

async function getHistory(id: string) {
  const { data: dom } = await supabase
    .from("domains")
    .select("name,ticker,layer")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("daily_metrics")
    .select("trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation,close_price")
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

  // 決算・ファンダ（個別株のみ。ETFは基本 None）
  let fundamentals: (Fundamentals & { ticker: string }) | null = null;
  if (kind === "stock" && dom?.ticker) {
    const { data: f } = await supabase
      .from("ticker_fundamentals").select("*").eq("ticker", dom.ticker).maybeSingle();
    fundamentals = (f as any) ?? null;
  }

  // 相対フェアバリュー：テーマ内ピアの予想PER中央値 × 自社予想EPS
  let fairValue: { discountPct: number; peerMedianPE: number; selfPE: number; peers: number } | null = null;
  const selfPE = fundamentals?.forward_pe && fundamentals.forward_pe > 0 ? fundamentals.forward_pe : null;
  const lastClose = data && data.length ? (data[data.length - 1].close_price as number | null) : null;
  if (kind === "stock" && selfPE && lastClose) {
    const { data: allDoms } = await supabase.from("domains").select("id,ticker");
    const peerTickers = (allDoms ?? [])
      .filter((d: any) => {
        const p = parseDomainId(d.id);
        // 同一テーマ・同一地域のピア（PER水準を揃えるため地域を限定）
        return p.theme === theme && p.region === region && p.kind === "stock" && d.ticker !== dom?.ticker;
      })
      .map((d: any) => d.ticker);
    if (peerTickers.length) {
      const { data: pf } = await supabase
        .from("ticker_fundamentals").select("forward_pe").in("ticker", peerTickers);
      const pes = (pf ?? []).map((x: any) => Number(x.forward_pe)).filter((v) => v > 0).sort((a, b) => a - b);
      if (pes.length) {
        const peerMedianPE = pes[Math.floor((pes.length - 1) / 2)];
        fairValue = { discountPct: (peerMedianPE / selfPE - 1) * 100, peerMedianPE, selfPE, peers: pes.length };
      }
    }
  }

  return { dom, history: (data ?? []) as MetricHistoryRow[], prediction, compare, fundamentals, fairValue };
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

  const { dom, history, prediction, compare, fundamentals, fairValue } = await getHistory(params.id);
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

  // 健康度レーダー（各スコアを0-100で）
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const radar: RadarPoint[] = [];
  if (latest) {
    if (latest.aiba_score != null) radar.push({ axis: "AIBA", value: Math.round(latest.aiba_score) });
    if (latest.technical_score != null) radar.push({ axis: "割安(テク)", value: Math.round(latest.technical_score) });
    if (latest.sentiment_score != null) radar.push({ axis: "熱量", value: Math.round(latest.sentiment_score) });
    if (latest.rsi_14 != null) radar.push({ axis: "非過熱", value: Math.round(clamp(100 - latest.rsi_14)) });
    // 押し目度：移動平均より下ほど高い
    if (latest.ma_deviation != null) {
      radar.push({ axis: "押し目度", value: Math.round(clamp(100 / (1 + Math.exp(0.1 * latest.ma_deviation)))) });
    }
    // 業績（ファンダがあれば）
    if (fundamentals && (fundamentals.eps_growth != null || fundamentals.revenue_growth != null)) {
      const pe = fundamentals.forward_pe && fundamentals.forward_pe > 0 ? fundamentals.forward_pe
        : fundamentals.trailing_pe && fundamentals.trailing_pe > 0 ? fundamentals.trailing_pe : null;
      let f = 50;
      if (fundamentals.eps_growth != null) f += fundamentals.eps_growth * 100 * 0.4;
      if (fundamentals.revenue_growth != null) f += fundamentals.revenue_growth * 100 * 0.4;
      if (pe != null && pe > 30) f -= (pe - 30) * 0.5;
      radar.push({ axis: "業績", value: Math.round(clamp(f)) });
    }
  }

  // 一行ナラティブ（自動要約）: 要点を1〜2文に
  const summary = latest
    ? narrative({
        name: dom?.name ?? params.id,
        aiba: latest.aiba_score,
        fairDiscount: fairValue ? Math.max(-60, Math.min(60, fairValue.discountPct)) : null,
        epsGrowth: fundamentals?.eps_growth ?? null,
        sentiment: latest.sentiment_score,
        buyzoneProb: prediction?.buyzone_prob ?? null,
        nextEarnings: fundamentals?.next_earnings_date ?? null,
      })
    : null;

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

      {summary && <p className="narrative">📝 {summary}</p>}

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
      {radar.length >= 3 && (
        <section className="layer">
          <h2 className="layer-title">健康度（スコア・レーダー）</h2>
          <HealthRadar data={radar} />
        </section>
      )}
      {history.length > 0 && (
        <p className="forecast-line" style={{ marginTop: 0 }}>📉 MACD：{macdLabel(macd)}　／　チャートの青破線＝ボリンジャーバンド(20,2σ)</p>
      )}
      {history.length === 0 ? (
        <div className="notice">この領域の時系列データがまだありません。</div>
      ) : (
        <TrendChart data={chartData} currency={cur} etfCompare={!!compare} buyLevel={guide.pullback} />
      )}

      {fundamentals && (fundamentals.trailing_pe != null || fundamentals.forward_pe != null || fundamentals.next_earnings_date != null) && (
        <section className="layer">
          <h2 className="layer-title">決算・ファンダと解釈</h2>
          {fairValue && (() => {
            const capped = Math.max(-60, Math.min(60, fairValue.discountPct));
            const over = Math.abs(fairValue.discountPct) > 60 ? "超" : "";
            return (
              <p className="forecast-line" style={{ marginTop: 0, marginBottom: 12 }}>
                💰 相対PER：自社予想 {fairValue.selfPE.toFixed(1)}倍 vs ピア中央値 {fairValue.peerMedianPE.toFixed(1)}倍（同地域n={fairValue.peers}）→{" "}
                <span style={{ color: capped >= 0 ? "#15a34a" : "#dc2626", fontWeight: 700 }}>
                  {capped >= 0 ? `${Math.abs(capped).toFixed(0)}%${over} 割安` : `${Math.abs(capped).toFixed(0)}%${over} 割高`}
                </span>
                <span className="forecast-note">（相対PERの目安。成長率差が大きい銘柄は参考程度）</span>
              </p>
            );
          })()}
          <div className="fund-grid">
            <div className="fund-cell"><span className="fund-k">実績PER</span><span className="fund-v">{fundamentals.trailing_pe && fundamentals.trailing_pe > 0 ? fundamentals.trailing_pe.toFixed(1) : "—"}</span></div>
            <div className="fund-cell"><span className="fund-k">予想PER</span><span className="fund-v">{fundamentals.forward_pe && fundamentals.forward_pe > 0 ? fundamentals.forward_pe.toFixed(1) : "—"}</span></div>
            <div className="fund-cell"><span className="fund-k">EPS成長</span><span className="fund-v">{fundamentals.eps_growth != null ? (fundamentals.eps_growth >= 0 ? "+" : "") + (fundamentals.eps_growth * 100).toFixed(0) + "%" : "—"}</span></div>
            <div className="fund-cell"><span className="fund-k">売上成長</span><span className="fund-v">{fundamentals.revenue_growth != null ? (fundamentals.revenue_growth >= 0 ? "+" : "") + (fundamentals.revenue_growth * 100).toFixed(0) + "%" : "—"}</span></div>
            <div className="fund-cell"><span className="fund-k">直近サプライズ</span><span className="fund-v">{fundamentals.last_surprise_pct != null ? (fundamentals.last_surprise_pct >= 0 ? "+" : "") + fundamentals.last_surprise_pct.toFixed(0) + "%" : "—"}</span></div>
            <div className="fund-cell"><span className="fund-k">次回決算</span><span className="fund-v">{fundamentals.next_earnings_date ?? "—"}</span></div>
          </div>
          <ul className="fund-interp">
            {interpretFundamentals(fundamentals).map((it, i) => (
              <li key={i} className={`fi-${it.tone}`}>{it.text}</li>
            ))}
          </ul>
          <p className="guide-note">※ 解釈は指標からの自動生成（簡易ルール）。投資助言ではありません。</p>
        </section>
      )}
    </main>
  );
}
