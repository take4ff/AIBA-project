"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getTickerHistory, getTickerThemes, TickerMetric, TickerFundamentals } from "@/lib/user-portfolio";
import { SellChart } from "@/components/LazyCharts";
import TechSummary from "@/components/TechSummary";
import HoldingHorizons from "@/components/HoldingHorizons";
import { sellBadge, money, pct, daysUntil } from "@/lib/sell-signal";
import { qualityScore, interpretFundamentals } from "@/lib/fundamentals";
import { scoreColor } from "@/lib/score-color";
import ConceptIcon from "@/components/ConceptIcon";

export default function HoldingPage({ params }: { params: { id: string } }) {
  const ticker = decodeURIComponent(params.id);
  const { user, ready } = useAuth();
  const [history, setHistory] = useState<TickerMetric[]>([]);
  const [holding, setHolding] = useState<any>(null);
  const [uniName, setUniName] = useState<string | null>(null);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [fundamentals, setFundamentals] = useState<TickerFundamentals | null>(null);
  const [aibaScore, setAibaScore] = useState<number | null>(null);
  const [aibaByDate, setAibaByDate] = useState<Map<string, number>>(new Map());
  const [stopPct, setStopPct] = useState(20);
  const [profitPct, setProfitPct] = useState(30);
  const [insider, setInsider] = useState<{ buys: number; sells: number; sellValue: number; buyValue: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = Number(localStorage.getItem("aiba_stop_pct"));
    if (s > 0) setStopPct(s);
    const p = Number(localStorage.getItem("aiba_profit_pct"));
    if (p > 0) setProfitPct(p);
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const [{ data: h }, hist, themes, { data: f }] = await Promise.all([
        supabaseBrowser.from("user_holdings").select("*").eq("ticker", ticker).maybeSingle(),
        getTickerHistory(ticker),
        getTickerThemes(),
        supabaseBrowser.from("ticker_fundamentals").select("*").eq("ticker", ticker).maybeSingle(),
      ]);
      setHolding(h);
      setHistory(hist);
      setFundamentals((f as TickerFundamentals | null) ?? null);

      // インサイダー売買（SEC Form 4・米国銘柄のみデータあり）。売りシグナルの補助材料。
      {
        const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
        const { data: ins } = await supabaseBrowser
          .from("insider_trades").select("tx_code,value_usd")
          .eq("ticker", ticker).gte("filed_at", cutoff).limit(100);
        if (ins && ins.length > 0) {
          const sum = (code: string) => ins.filter((r: any) => r.tx_code === code).reduce((a: number, r: any) => a + Number(r.value_usd ?? 0), 0);
          setInsider({
            buys: ins.filter((r: any) => r.tx_code === "P").length,
            sells: ins.filter((r: any) => r.tx_code === "S").length,
            buyValue: sum("P"),
            sellValue: sum("S"),
          });
        }
      }
      const ti = themes.get(ticker);
      setUniName(ti?.name ?? null);
      const did = ti?.id ?? null;
      setDomainId(did);

      // AIBAスコア履歴をdomain_idが判明してから取得（チャート用＋ヘッダー表示用）
      if (did) {
        const { data: dm } = await supabaseBrowser
          .from("daily_metrics")
          .select("trade_date,aiba_score")
          .eq("domain_id", did)
          .not("aiba_score", "is", null)
          .order("trade_date", { ascending: false })
          .limit(1000);
        const map = new Map<string, number>();
        for (const r of (dm ?? []) as any[]) if (r.aiba_score != null) map.set(r.trade_date, r.aiba_score);
        setAibaByDate(map);
        // 最新スコア = 降順なので先頭
        setAibaScore((dm?.[0] as any)?.aiba_score ?? null);
      }

      setLoading(false);
    })();
  }, [user, ticker]);

  const displayName = (holding?.name && holding.name !== ticker) ? holding.name : (uniName ?? ticker);
  const latest = history[history.length - 1];
  const close = latest?.close_price ?? null;
  const currency = (holding?.currency ?? "JPY") as "JPY" | "USD";
  const ret = holding?.avg_cost && close ? ((close - holding.avg_cost) / holding.avg_cost) * 100 : null;
  const badge = sellBadge(latest?.overheat ?? null);

  // 損切り・利確の目標価格
  const stopPrice = holding?.avg_cost ? holding.avg_cost * (1 - stopPct / 100) : null;
  const profitPrice = holding?.avg_cost ? holding.avg_cost * (1 + profitPct / 100) : null;
  const stopTriggered = ret != null && ret <= -stopPct;
  const profitTriggered = ret != null && ret >= profitPct;

  const chartData = history.map((m) => ({
    trade_date: m.trade_date, close_price: m.close_price, rsi_14: m.rsi_14, overheat: m.overheat,
    aiba_score: aibaByDate.get(m.trade_date) ?? null,
  }));

  const hasFund = fundamentals && (
    fundamentals.trailing_pe != null || fundamentals.forward_pe != null ||
    fundamentals.next_earnings_date != null || fundamentals.psr != null ||
    fundamentals.gross_margin != null || fundamentals.burn_rate_monthly != null
  );

  return (
    <main className="container">
      <header className="header">
        <Link className="back-link" href="/portfolio">← ポートフォリオへ</Link>
        <h1>
          {displayName}
          <span className="ticker">{ticker}</span>
          <span className={`sell-badge ${badge.cls}`} style={{ marginLeft: 10 }}>{badge.label}</span>
        </h1>
        {latest && (
          <p>
            現在値 <span className="date">{money(close, currency)}</span>
            {holding?.avg_cost != null && <>／ 平均取得単価 {money(holding.avg_cost, currency)}</>}
            {ret != null && <>／ 損益 <span style={{ color: ret >= 0 ? "#15a34a" : "#dc2626", fontWeight: 700 }}>{pct(ret)}</span></>}
            {latest.overheat != null && <>／ 過熱度 {Math.round(latest.overheat)}</>}
            {aibaScore != null && (
              <>／ AIBAスコア <span className="combo-pill" style={{ background: scoreColor(aibaScore), marginLeft: 2 }}>{Math.round(aibaScore)}</span></>
            )}
            （{latest.trade_date}）
          </p>
        )}

        {/* 損切り・利確ライン */}
        {holding?.avg_cost != null && (stopPrice != null || profitPrice != null) && (
          <p style={{ marginTop: 6, fontSize: 13 }}>
            <span style={{ color: stopTriggered ? "#dc2626" : "var(--muted)", fontWeight: stopTriggered ? 700 : 400 }}>
              損切りメド {money(stopPrice, currency)}（−{stopPct}%）
              {stopTriggered && " ⚠️ 到達"}
            </span>
            <span style={{ margin: "0 10px", color: "var(--muted)" }}>／</span>
            <span style={{ color: profitTriggered ? "#15a34a" : "var(--muted)", fontWeight: profitTriggered ? 700 : 400 }}>
              利確メド {money(profitPrice, currency)}（+{profitPct}%）
              {profitTriggered && " ✓ 到達"}
            </span>
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>
              （<Link href="/portfolio" style={{ color: "var(--muted)" }}>一覧で変更</Link>）
            </span>
          </p>
        )}

        {domainId && (
          <p style={{ marginTop: 6 }}>
            <Link className="back-link" href={`/domain/${domainId}`}>
              買い目線の詳細（購入目安・1ヶ月予測・AIBAスコア推移）→
            </Link>
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
        <>
          <SellChart
            data={chartData}
            currency={currency}
            avgCost={holding?.avg_cost ?? null}
            stopPrice={stopPrice}
            profitPrice={profitPrice}
          />
          <HoldingHorizons closes={history.map((m) => m.close_price)} rsi={latest?.rsi_14 ?? null} overheat={latest?.overheat ?? null} />
          <TechSummary closes={history.map((m) => m.close_price)} rsi={latest?.rsi_14 ?? null} />

          {hasFund && (() => {
            const f = fundamentals!;
            const q = qualityScore(f);
            const interp = interpretFundamentals(f);
            const earningsDays = daysUntil(f.next_earnings_date ?? null);
            const earningsColor = earningsDays != null && earningsDays <= 7 ? "#dc2626" : earningsDays != null && earningsDays <= 30 ? "#d97706" : "inherit";

            const grossPct = f.gross_margin != null ? f.gross_margin * 100 : null;
            const grossColor = grossPct == null ? "var(--muted)" : grossPct >= 60 ? "#34d399" : grossPct >= 40 ? "#2dd4bf" : grossPct >= 20 ? "#60a5fa" : "#fbbf24";
            const revColor = f.revenue_growth == null ? "var(--muted)" : f.revenue_growth >= 0.3 ? "#34d399" : f.revenue_growth >= 0 ? "#60a5fa" : "#f87171";
            const runwayColor = f.cash_runway_months == null ? "var(--muted)" : f.cash_runway_months < 12 ? "#f87171" : f.cash_runway_months < 18 ? "#fbbf24" : "#34d399";
            const fmtBurn = (v: number) => currency === "JPY"
              ? v >= 1e8 ? `¥${(v / 1e8).toFixed(1)}億/月` : `¥${(v / 1e6).toFixed(0)}百万/月`
              : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B/月` : `$${(v / 1e6).toFixed(0)}M/月`;

            return (
              <details className="collapse-section" open>
                <summary>決算・ファンダ・グロース指標</summary>

                {(f.trailing_pe != null || f.forward_pe != null || f.next_earnings_date != null) && (
                  <div className="fund-grid" style={{ marginBottom: 12 }}>
                    <div className="fund-cell"><span className="fund-k">実績PER</span><span className="fund-v">{f.trailing_pe && f.trailing_pe > 0 ? f.trailing_pe.toFixed(1) : "—"}</span></div>
                    <div className="fund-cell"><span className="fund-k">予想PER</span><span className="fund-v">{f.forward_pe && f.forward_pe > 0 ? f.forward_pe.toFixed(1) : "—"}</span></div>
                    <div className="fund-cell"><span className="fund-k">EPS成長</span><span className="fund-v">{f.eps_growth != null ? (f.eps_growth >= 0 ? "+" : "") + (f.eps_growth * 100).toFixed(0) + "%" : "—"}</span></div>
                    <div className="fund-cell"><span className="fund-k">直近サプライズ</span><span className="fund-v">{f.last_surprise_pct != null ? (f.last_surprise_pct >= 0 ? "+" : "") + f.last_surprise_pct.toFixed(0) + "%" : "—"}</span></div>
                    <div className="fund-cell">
                      <span className="fund-k">次回決算</span>
                      <span className="fund-v" style={{ color: earningsColor, fontWeight: earningsDays != null && earningsDays <= 30 ? 700 : 400 }}>
                        {f.next_earnings_date ?? "—"}
                        {earningsDays != null && <span style={{ marginLeft: 4, fontSize: 12 }}>（あと{earningsDays}日）</span>}
                      </span>
                    </div>
                  </div>
                )}

                {(f.psr != null || grossPct != null || f.revenue_growth != null || f.burn_rate_monthly != null) && (
                  <>
                    <p className="forecast-line" style={{ marginTop: 4, marginBottom: 8, fontWeight: 700, fontSize: 13 }}>
                      グロース・キャッシュ指標
                    </p>
                    <div className="fund-grid" style={{ marginBottom: 12 }}>
                      {f.psr != null && <div className="fund-cell"><span className="fund-k">PSR</span><span className="fund-v">{f.psr.toFixed(1)}倍</span></div>}
                      {grossPct != null && <div className="fund-cell"><span className="fund-k">粗利率</span><span className="fund-v" style={{ color: grossColor }}>{grossPct.toFixed(1)}%</span></div>}
                      {f.revenue_growth != null && (
                        <div className="fund-cell">
                          <span className="fund-k">売上成長率</span>
                          <span className="fund-v" style={{ color: revColor }}>
                            {f.revenue_growth >= 0 ? "+" : ""}{(f.revenue_growth * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {f.burn_rate_monthly != null && (
                        <div className="fund-cell"><span className="fund-k">バーンレート</span><span className="fund-v" style={{ color: "#f87171" }}>{fmtBurn(f.burn_rate_monthly)}</span></div>
                      )}
                      {f.cash_runway_months != null && (
                        <div className="fund-cell"><span className="fund-k">ランウェイ</span><span className="fund-v" style={{ color: runwayColor, fontWeight: 700 }}>{Math.round(f.cash_runway_months)}ヶ月</span></div>
                      )}
                    </div>
                  </>
                )}

                {q.score != null && (() => {
                  const col = q.score >= 65 ? "#15a34a" : q.score < 35 ? "#dc2626" : "var(--muted)";
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <p className="forecast-line" style={{ marginTop: 0 }}>
                        <ConceptIcon name="guide" size={14} /> 事業の頑丈さ：<span style={{ fontWeight: 800, color: col }}>{q.score}</span>（{q.label}）
                        <span className="forecast-note">収益性・財務健全性・キャッシュ創出から算出。</span>
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

                {interp.length > 0 && (
                  <ul className="fund-interp">
                    {interp.map((it, i) => <li key={i} className={`fi-${it.tone}`}>{it.text}</li>)}
                  </ul>
                )}
                <p className="guide-note">※ 解釈は指標からの自動生成。投資助言ではありません。</p>
              </details>
            );
          })()}

          {insider && (() => {
            const fmtUsd = (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`;
            const heavySell = insider.sells >= 3 && insider.buys === 0;
            return (
              <p className="forecast-line" style={{ marginTop: 12 }}>
                <ConceptIcon name="guide" size={14} /> インサイダー売買（90日）：
                買い <span style={{ color: "#15a34a", fontWeight: 700 }}>{insider.buys}件（{fmtUsd(insider.buyValue)}）</span>
                {" / "}売り <span style={{ color: "#dc2626", fontWeight: 700 }}>{insider.sells}件（{fmtUsd(insider.sellValue)}）</span>
                {heavySell && <span style={{ marginLeft: 8, fontWeight: 700, color: "#d97706" }}>売りが目立つ（過熱・決算と合わせて要注意）</span>}
                {domainId && <Link href={`/domain/${domainId}`} style={{ marginLeft: 8, fontSize: 12 }}>明細 →</Link>}
              </p>
            );
          })()}
        </>
      )}
    </main>
  );
}
