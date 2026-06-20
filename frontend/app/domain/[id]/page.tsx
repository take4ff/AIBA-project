import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MetricHistoryRow } from "@/lib/types";
import TrendChart from "@/components/TrendChart";
import { fmt } from "@/lib/score-color";
import { parseDomainId, REGION_LABEL, REGION_PATH } from "@/lib/regions";
import { bollinger, macdState, macdLabel, buyGuide, sma, longTerm, downsideProfile } from "@/lib/indicators";
import TechSummary from "@/components/TechSummary";
import HoldingHorizons from "@/components/HoldingHorizons";
import { money } from "@/lib/sell-signal";
import { interpretFundamentals, qualityScore, Fundamentals } from "@/lib/fundamentals";
import HealthRadar, { RadarPoint } from "@/components/HealthRadar";
import ConceptIcon from "@/components/ConceptIcon";
import { narrative } from "@/lib/narrative";

export const revalidate = 600; // ISR: 日次更新データを10分キャッシュ（遷移高速化）

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
    .order("trade_date", { ascending: false })   // 最新分を取得し…
    .limit(1000);
  if (data) data.reverse();                        // …表示用に昇順へ戻す

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
      .eq("domain_id", etfId).order("trade_date", { ascending: false }).limit(1000);
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

  // 業界平均（同テーマ・同地域の個別株の最新スコア平均）＝レーダー比較用
  let peerAgg: { aiba: number | null; technical: number | null; sentiment: number | null; rsi: number | null; maDev: number | null; n: number } | null = null;
  {
    const { data: peerDoms } = await supabase.from("domains").select("id");
    const peerIds = (peerDoms ?? []).map((d: any) => d.id).filter((pid: string) => {
      const p = parseDomainId(pid);
      return p.theme === theme && p.region === region && p.kind === "stock" && pid !== id;
    });
    if (peerIds.length) {
      const cutoff = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
      const { data: pm } = await supabase
        .from("daily_metrics")
        .select("domain_id,trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation")
        .in("domain_id", peerIds).gte("trade_date", cutoff);
      const latestByDom = new Map<string, any>();
      for (const m of pm ?? []) {
        const c = latestByDom.get(m.domain_id);
        if (!c || m.trade_date > c.trade_date) latestByDom.set(m.domain_id, m);
      }
      const peers = [...latestByDom.values()];
      const avg = (key: string) => {
        const vals = peers.map((r) => r[key]).filter((v: any) => v != null).map(Number);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };
      if (peers.length) {
        peerAgg = {
          aiba: avg("aiba_score"), technical: avg("technical_score"), sentiment: avg("sentiment_score"),
          rsi: avg("rsi_14"), maDev: avg("ma_deviation"), n: peers.length,
        };
      }
    }
  }

  return { dom, history: (data ?? []) as MetricHistoryRow[], prediction, compare, fundamentals, fairValue, peerAgg };
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

  const { dom, history, prediction, compare, fundamentals, fairValue, peerAgg } = await getHistory(params.id);
  const latest = history[history.length - 1];
  const { region } = parseDomainId(params.id);

  // 補助テクニカル（表示のみ）: ボリンジャーバンドを重ね、MACD状態を表示
  const closes = history.map((h) => h.close_price);
  const bb = bollinger(closes);
  const ma200series = sma(closes, 200);
  const chartData = history.map((h, i) => ({
    ...h,
    bb_upper: bb.upper[i],
    bb_lower: bb.lower[i],
    ma200: ma200series[i],
    etf_aiba: compare?.aibaByDate[h.trade_date] ?? null,
  }));
  const macd = macdState(closes);
  const guide = buyGuide(closes);
  const lt = longTerm(closes);
  const ds = downsideProfile(closes);
  // 保有期間別判定用：過熱度（=100−テクニカル）とセンチメント傾き（直近−約1ヶ月前）
  const hhOverheat = latest?.technical_score != null ? Math.round((100 - latest.technical_score) * 100) / 100 : null;
  const sentSeries = history.map((h) => h.sentiment_score).filter((x): x is number => x != null);
  const hhSentTrend = sentSeries.length >= 2 ? Math.round((sentSeries[sentSeries.length - 1] - sentSeries[Math.max(0, sentSeries.length - 21)]) * 10) / 10 : null;
  const cur = region === "jp" ? "JPY" : "USD";

  // 順張りモメンタム（0-100）: MAより上・RSI強い・直近上昇 ほど高い（AIBAの逆張りと対の視点）
  const clampM = (x: number) => Math.max(0, Math.min(100, x));
  let momentum: number | null = null;
  if (latest && latest.rsi_14 != null && latest.ma_deviation != null) {
    const validCloses = closes.filter((c): c is number => c != null);
    const past = validCloses.length > 21 ? validCloses[validCloses.length - 21] : validCloses[0];
    const last = validCloses[validCloses.length - 1];
    const priceTrend = past ? ((last - past) / past) * 100 : 0;
    const maPos = clampM(50 + latest.ma_deviation * 3);
    const rsiMom = clampM(latest.rsi_14 - Math.max(0, latest.rsi_14 - 80) * 2);
    const priceMom = clampM(50 + priceTrend * 2);
    momentum = Math.round((maPos + rsiMom + priceMom) / 3);
  }
  const momentumLabel = (m: number) => (m >= 70 ? "強い上昇基調（順張り好機）" : m >= 55 ? "上昇基調" : m >= 45 ? "中立" : "下降基調（順張り不向き）");

  // 健康度レーダー（各スコアを0-100で）
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const radar: RadarPoint[] = [];
  // 各軸の業界平均（同テーマ・同地域の個別株平均）。peerAgg が無ければ undefined。
  const dipScore = (mad: number) => Math.round(clamp(100 / (1 + Math.exp(0.1 * mad))));
  if (latest) {
    if (latest.aiba_score != null) radar.push({ axis: "AIBA", value: Math.round(latest.aiba_score), avg: peerAgg?.aiba != null ? Math.round(peerAgg.aiba) : undefined });
    if (latest.technical_score != null) radar.push({ axis: "割安(テク)", value: Math.round(latest.technical_score), avg: peerAgg?.technical != null ? Math.round(peerAgg.technical) : undefined });
    if (latest.sentiment_score != null) radar.push({ axis: "熱量", value: Math.round(latest.sentiment_score), avg: peerAgg?.sentiment != null ? Math.round(peerAgg.sentiment) : undefined });
    if (latest.rsi_14 != null) radar.push({ axis: "非過熱", value: Math.round(clamp(100 - latest.rsi_14)), avg: peerAgg?.rsi != null ? Math.round(clamp(100 - peerAgg.rsi)) : undefined });
    // 押し目度：移動平均より下ほど高い
    if (latest.ma_deviation != null) {
      radar.push({ axis: "押し目度", value: dipScore(latest.ma_deviation), avg: peerAgg?.maDev != null ? dipScore(peerAgg.maDev) : undefined });
    }
    // 事業の頑丈さ（品質スコア）。無ければ従来の簡易業績スコアにフォールバック。
    const q = fundamentals ? qualityScore(fundamentals) : null;
    if (q && q.score != null) {
      radar.push({ axis: "頑丈さ", value: q.score });
    } else if (fundamentals && (fundamentals.eps_growth != null || fundamentals.revenue_growth != null)) {
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
            <ConceptIcon name="forecast" size={14} /> 1ヶ月先の見通し：今後1ヶ月のうちに買い場（AIBA≧60）が訪れる確率{" "}
            <span className="date">{Math.round((prediction.buyzone_prob ?? 0) * 100)}%</span>
            {" / "}予測AIBA <span className="date">{fmt(prediction.pred_aiba)}</span>
            <span className="forecast-note">（{prediction.horizon_days}営業日先。「株価が上がる確率」ではなく「買い場が来る確率」。すでにAIBA≧60なら今が買い場。保有はテーマ成長を長期で）</span>
          </p>
        )}
      </header>

      {summary && <p className="narrative"><ConceptIcon name="narrative" size={15} /> {summary}</p>}

      {/* 株価×スコアチャート（最重要なので上部に配置） */}
      {history.length === 0 ? (
        <div className="notice">この領域の時系列データがまだありません。</div>
      ) : (
        <>
          <TrendChart data={chartData} currency={cur} etfCompare={!!compare} buyLevel={guide.pullback} />
          <p className="forecast-line" style={{ marginTop: 4 }}><ConceptIcon name="macd" size={14} /> MACD：{macdLabel(macd)}　／　チャートの青破線＝ボリンジャーバンド(20,2σ)</p>
        </>
      )}

      {(compare && vsDelta != null) || guide.fair != null || ds.floorStrong != null || lt.dev200 != null || momentum != null ? (
      <section className="layer">
        <h2 className="layer-title">サマリー指標</h2>
      {compare && vsDelta != null && (
        <p className="forecast-line" style={{ marginTop: 0 }}>
          <ConceptIcon name="both" size={14} /> 業界比較：この銘柄 AIBA {fmt(stockAiba)} vs 業界ETF {compare.ticker} {fmt(etfAiba)} →{" "}
          <span style={{ color: vsDelta >= 0 ? "#15a34a" : "#dc2626", fontWeight: 700 }}>
            {vsDelta >= 0 ? `業界より割安（+${vsDelta.toFixed(0)}）` : `業界より割高/過熱（${vsDelta.toFixed(0)}）`}
          </span>
        </p>
      )}
      {guide.fair != null && (
        <p className="forecast-line">
          <ConceptIcon name="guide" size={14} /> 購入目安：妥当値(25日MA) <span className="date">{money(guide.fair, cur)}</span>
          {" / "}押し目買い目安 <span style={{ color: "#15a34a", fontWeight: 700 }}>{money(guide.pullback, cur)}</span>
          {" / "}下値支持(60日安値) {money(guide.support, cur)}
          <span className="forecast-note">（現在 {money(guide.current, cur)}）</span>
        </p>
      )}
      {ds.floorStrong != null && (
        <p className="forecast-line">
          <ConceptIcon name="warn" size={14} /> 下方リスク：下値メド <span style={{ color: "#15a34a", fontWeight: 700 }}>{money(ds.floorStrong, cur)}</span>
          （52週安値・<span style={{ fontWeight: 700 }}>下落余地 {ds.downsidePct}%</span>）{" / "}近い支持 {money(ds.floorNear, cur)}
          {ds.stability && (
            <> {" / "}値動きの安定度 <span style={{ fontWeight: 700, color: ds.stability === "高い" ? "#15a34a" : ds.stability === "低い" ? "#dc2626" : "var(--muted)" }}>{ds.stability}</span></>
          )}
          <span className="forecast-note">
            （年率ボラ {ds.volAnnual}%・1年の最大下落 {ds.maxDrawdown}%。支持はテクニカルな目安で、割れてさらに下落することもある＝「絶対の底」ではない
            {(() => {
              const pe = fundamentals ? (fundamentals.forward_pe && fundamentals.forward_pe > 0 ? fundamentals.forward_pe : fundamentals.trailing_pe && fundamentals.trailing_pe > 0 ? fundamentals.trailing_pe : null) : null;
              if (fundamentals == null) return "";
              if (pe == null) return "。赤字企業は業績面の下値が読みにくく、下落が深くなりやすい点に注意";
              if (pe < 20 && (fundamentals.eps_growth ?? 0) >= 0) return "。黒字かつ割安で、事業面でも下値は相対的に堅め";
              if (pe >= 40) return "。高PERで業績未達なら下値が深くなりやすい";
              return "";
            })()}）
          </span>
        </p>
      )}
      {lt.dev200 != null && (
        <p className="forecast-line">
          <ConceptIcon name="longterm" size={14} /> 長期トレンド：200日線乖離 <span className="date">{lt.dev200 >= 0 ? "+" : ""}{lt.dev200}%</span>
          {lt.rangePct != null && <> ／ 52週レンジ位置 <span className="date">{lt.rangePct}%</span></>}
          {" → "}
          <span style={{ fontWeight: 700, color: lt.zone === "長期の買い場" || lt.zone === "やや割安" ? "#15a34a" : lt.zone === "割高" ? "#dc2626" : "var(--muted)" }}>
            {lt.zone}
          </span>
          <span className="forecast-note">（長期保有の目安。200日線を下回るほど長期の押し目）</span>
        </p>
      )}
      {momentum != null && (
        <p className="forecast-line">
          <ConceptIcon name="momentum" size={14} /> 順張りモメンタム：<span className="date">{momentum}</span>
          <span style={{ marginLeft: 8, fontWeight: 700, color: momentum >= 55 ? "#15a34a" : momentum < 45 ? "#dc2626" : "var(--muted)" }}>
            {momentumLabel(momentum)}
          </span>
          <span className="forecast-note">（勢いに乗る視点。詳細は下の「テクニカル総合判定」）</span>
        </p>
      )}
      </section>
      ) : null}

      <HoldingHorizons closes={closes} rsi={latest?.rsi_14 ?? null} overheat={hhOverheat} sentimentTrend={hhSentTrend} />

      {radar.length >= 3 && (
        <details className="collapse-section">
          <summary>健康度（スコア・レーダー）</summary>
          <HealthRadar data={radar} showAvg={peerAgg != null} avgLabel={peerAgg != null ? `業界平均(n=${peerAgg.n})` : undefined} />
          {peerAgg != null && (
            <p className="guide-note" style={{ marginTop: 4 }}>
              グレーは<strong>同テーマ・同地域の個別株 {peerAgg.n} 銘柄の最新スコア平均</strong>（業界平均）。各軸とも外側ほど良好なので、
              <strong>青がグレーより外側＝業界平均より優れた軸</strong>です。例：「割安(テク)」「押し目度」が平均より外なら相対的に売られすぎ/押し目、「熱量」が外なら研究の注目度が業界より高い。
              ※最新断面の単純平均で、サンプルが少ない（n小）テーマは振れやすい点に注意。
            </p>
          )}
        </details>
      )}
      <TechSummary closes={closes} rsi={latest?.rsi_14 ?? null} collapsible />

      {fundamentals && (fundamentals.trailing_pe != null || fundamentals.forward_pe != null || fundamentals.next_earnings_date != null) && (
        <details className="collapse-section">
          <summary>決算・ファンダ・事業の頑丈さ</summary>
          {fairValue && (() => {
            const capped = Math.max(-60, Math.min(60, fairValue.discountPct));
            const over = Math.abs(fairValue.discountPct) > 60 ? "超" : "";
            return (
              <p className="forecast-line" style={{ marginTop: 0, marginBottom: 12 }}>
                <ConceptIcon name="value" size={14} /> 相対PER：自社予想 {fairValue.selfPE.toFixed(1)}倍 vs ピア中央値 {fairValue.peerMedianPE.toFixed(1)}倍（同地域n={fairValue.peers}）→{" "}
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
          {(() => {
            const q = qualityScore(fundamentals);
            if (q.score == null) return null;
            const col = q.score >= 65 ? "#15a34a" : q.score < 35 ? "#dc2626" : "var(--muted)";
            return (
              <div style={{ marginTop: 14 }}>
                <p className="forecast-line" style={{ marginTop: 0 }}>
                  <ConceptIcon name="guide" size={14} /> 事業の頑丈さ：<span style={{ fontWeight: 800, color: col }}>{q.score}</span>（{q.label}）
                  <span className="forecast-note">収益性・財務健全性・キャッシュ創出から算出。高いほど崩れにくく下方リスクが小さい目安。</span>
                </p>
                <div className="fund-grid">
                  {q.parts.map((p) => (
                    <div key={p.name} className="fund-cell" title={`${p.pts}点`}>
                      <span className="fund-k">{p.name}</span>
                      <span className="fund-v" style={{ color: p.pts >= 65 ? "#15a34a" : p.pts < 35 ? "#dc2626" : undefined }}>{p.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <ul className="fund-interp">
            {interpretFundamentals(fundamentals).map((it, i) => (
              <li key={i} className={`fi-${it.tone}`}>{it.text}</li>
            ))}
          </ul>
          <p className="guide-note">※ 解釈は指標からの自動生成（簡易ルール）。投資助言ではありません。</p>
        </details>
      )}
    </main>
  );
}
