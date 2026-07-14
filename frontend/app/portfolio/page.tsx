"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import NavTabs from "@/components/NavTabs";
import {
  UserHolding, TickerMetric, TickerFundamentals,
  getHoldings, getTickerData, getTickerThemes, getFundAcqCloses, addHolding, updateHolding, deleteHolding,
  getAllTickerHistories,
} from "@/lib/user-portfolio";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { assessSell, assessStopLoss, assessTakeProfit, money, pct, overheatColor, daysUntil } from "@/lib/sell-signal";
import { fmt, scoreColor } from "@/lib/score-color";
import AllocationAnalysis from "@/components/AllocationAnalysis";
import ConceptIcon from "@/components/ConceptIcon";
import { PortfolioChart } from "@/components/LazyCharts";

const EMPTY = {
  kind: "stock" as "stock" | "fund",
  ticker: "", name: "", currency: "JPY" as "JPY" | "USD", avg_cost: "", shares: "",
  acquired_on: "", principal: "",
};

export default function PortfolioPage() {
  const { user, ready } = useAuth();
  const [holdings, setHoldings] = useState<UserHolding[]>([]);
  const [metrics, setMetrics] = useState<Map<string, TickerMetric>>(new Map());
  const [funds, setFunds] = useState<Map<string, TickerFundamentals>>(new Map());
  const [fundAcq, setFundAcq] = useState<Map<string, number>>(new Map());  // 投信: 代用ETFの取得日終値
  const [themeMap, setThemeMap] = useState<Map<string, { theme: string; label: string; region: string; name: string }>>(new Map());
  const [form, setForm] = useState({ ...EMPTY });
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ ticker: string; name: string; avg_cost: string; shares: string; is_fund: boolean; principal: string; acquired_on: string } | null>(null);
  const [histories, setHistories] = useState<Map<string, { date: string; close: number }[]>>(new Map());
  const [acwiHistory, setAcwiHistory] = useState<{ date: string; close: number }[]>([]);
  const [stopPct, setStopPct] = useState(20);  // 損切りライン[%]（取得単価からの下落率）
  const [profitPct, setProfitPct] = useState(30);  // 利確ライン[%]（取得単価からの上昇率）

  // 損切り/利確ラインは端末に保存して次回も維持
  useEffect(() => {
    const s = Number(localStorage.getItem("aiba_stop_pct"));
    if (s > 0) setStopPct(s);
    const p = Number(localStorage.getItem("aiba_profit_pct"));
    if (p > 0) setProfitPct(p);
  }, []);
  useEffect(() => { localStorage.setItem("aiba_stop_pct", String(stopPct)); }, [stopPct]);
  useEffect(() => { localStorage.setItem("aiba_profit_pct", String(profitPct)); }, [profitPct]);

  const reload = useCallback(async () => {
    const hs = await getHoldings();
    setHoldings(hs);
    const stockTickers = hs.filter((h) => !h.is_fund).map((h) => h.ticker);
    const cutoff = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    const [{ metrics, funds }, tm, hist, acwiRes] = await Promise.all([
      getTickerData(hs.map((h) => h.ticker)),
      getTickerThemes(),
      getAllTickerHistories(stockTickers),
      supabaseBrowser.from("benchmark_prices")
        .select("trade_date,close").eq("ticker", "ACWI")
        .gte("trade_date", cutoff).order("trade_date", { ascending: true }),
    ]);
    setMetrics(metrics);
    setFunds(funds);
    setThemeMap(tm);
    setHistories(hist);
    setAcwiHistory(
      ((acwiRes.data ?? []) as any[])
        .filter((r) => r.close != null)
        .map((r) => ({ date: r.trade_date as string, close: Number(r.close) }))
    );
    // 投信は代用ETFの取得日終値を取り、リターンで評価
    const fundList = hs.filter((h) => h.is_fund && h.acquired_on).map((h) => ({ ticker: h.ticker, acquired_on: h.acquired_on as string }));
    setFundAcq(fundList.length ? await getFundAcqCloses(fundList) : new Map());
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const ticker = form.ticker.trim();
    if (!ticker) return;
    const isFund = form.kind === "fund";
    if (isFund && !form.acquired_on) { setErr("投信は取得日を入力してください（代用ETFのリターンで評価します）。"); return; }
    const msg = await addHolding({
      ticker, name: form.name.trim() || ticker, currency: form.currency,
      avg_cost: !isFund && form.avg_cost ? Number(form.avg_cost) : null,
      shares: form.shares ? Number(form.shares) : null,
      is_fund: isFund,
      acquired_on: isFund ? form.acquired_on : null,
      principal: isFund && form.principal ? Number(form.principal) : null,
    });
    if (msg) setErr(msg);
    else { setForm({ ...EMPTY }); reload(); }
  }

  async function onSaveEdit() {
    if (!edit) return;
    const patch: Partial<UserHolding> = {
      name: edit.name || null,
      shares: edit.shares ? Number(edit.shares) : null,
    };
    if (edit.is_fund) {
      patch.principal = edit.principal ? Number(edit.principal) : null;
      patch.acquired_on = edit.acquired_on || null;
    } else {
      patch.avg_cost = edit.avg_cost ? Number(edit.avg_cost) : null;
    }
    await updateHolding(edit.ticker, patch);
    setEdit(null);
    reload();
  }

  if (!ready) return <main className="container"><NavTabs active="portfolio" /></main>;

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="portfolio" size={24} /> マイ・ポートフォリオ（売り時）</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>保有銘柄の<strong>過熱度</strong>・ファンダ・決算から売り時を可視化。アカウントに紐付き、追加・編集できます。</p>
      </header>
      <NavTabs active="portfolio" />

      {!user ? (
        <div className="notice" style={{ marginTop: 20 }}>
          ポートフォリオを使うには <Link className="back-link" href="/login">ログイン</Link> してください。
        </div>
      ) : (
        <>
          <form className="pf-add" onSubmit={onAdd}>
            <select className="login-input" value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "stock" | "fund" })}>
              <option value="stock">株/ETF</option><option value="fund">投信</option>
            </select>
            <input className="login-input" placeholder={form.kind === "fund" ? "代用ETF/指数（例: VOO / 1655.T）" : "ティッカー（例: NVDA / 8035.T）"} value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
            <input className="login-input" placeholder={form.kind === "fund" ? "投信名（例: eMAXIS Slim 米国株式）" : "銘柄名（任意）"} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="login-input" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value as "JPY" | "USD" })}>
              <option value="JPY">JPY</option><option value="USD">USD</option>
            </select>
            {form.kind === "fund" ? (
              <>
                <input className="login-input" type="date" title="取得日" value={form.acquired_on}
                  onChange={(e) => setForm({ ...form, acquired_on: e.target.value })} />
                <input className="login-input" type="number" step="any" placeholder="取得額（投資元本）" value={form.principal}
                  onChange={(e) => setForm({ ...form, principal: e.target.value })} />
                <input className="login-input" type="number" step="any" placeholder="口数（任意）" value={form.shares}
                  onChange={(e) => setForm({ ...form, shares: e.target.value })} />
              </>
            ) : (
              <>
                <input className="login-input" type="number" step="any" placeholder="平均取得単価" value={form.avg_cost}
                  onChange={(e) => setForm({ ...form, avg_cost: e.target.value })} />
                <input className="login-input" type="number" step="any" placeholder="株数（任意）" value={form.shares}
                  onChange={(e) => setForm({ ...form, shares: e.target.value })} />
              </>
            )}
            <button className="kind-active login-submit" type="submit">追加</button>
          </form>
          {err && <p style={{ color: "#dc2626", fontSize: 13 }}>{err}</p>}

          {holdings.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 8 }}>
              <label className="pf-stop" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                損切りライン：取得単価から −
                <input className="login-input" type="number" min={1} max={90} step={1} value={stopPct}
                  onChange={(ev) => setStopPct(Math.max(1, Math.min(90, Number(ev.target.value) || 0)))}
                  style={{ width: 60, padding: "4px 6px" }} />
                ％で「損切り検討」
              </label>
              <label className="pf-stop" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                利確ライン：取得単価から ＋
                <input className="login-input" type="number" min={1} max={500} step={5} value={profitPct}
                  onChange={(ev) => setProfitPct(Math.max(1, Math.min(500, Number(ev.target.value) || 0)))}
                  style={{ width: 60, padding: "4px 6px" }} />
                ％で「利確検討」
              </label>
            </div>
          )}

          {holdings.length === 0 ? (
            <div className="notice" style={{ marginTop: 12 }}>銘柄を追加してください。監視ユニバースの銘柄は即時にスコアが表示され、ユニバース外は翌営業日の日次バッチで反映されます。</div>
          ) : (
            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table className="table">
                <thead><tr>
                  <th>銘柄</th><th className="num">平均取得単価</th><th className="num">株数</th><th className="num">現在値</th>
                  <th className="num">損益</th><th className="num">AIBAスコア</th><th className="num">過熱度</th><th>売りシグナル</th>
                  <th>操作</th>
                </tr></thead>
                <tbody>
                  {holdings.map((h) => {
                    const m = metrics.get(h.ticker);
                    const f = funds.get(h.ticker);
                    const close = m?.close_price ?? null;
                    // 投信は代用ETFの取得日→現在のリターンで損益を概算。株/ETFは取得単価比。
                    const acq = h.is_fund ? fundAcq.get(h.ticker) ?? null : null;
                    const ret = h.is_fund
                      ? (acq && close ? ((close - acq) / acq) * 100 : null)
                      : (h.avg_cost && close ? ((close - h.avg_cost) / h.avg_cost) * 100 : null);
                    const a = assessSell({
                      overheat: m?.overheat ?? null,
                      forward_pe: f?.forward_pe, trailing_pe: f?.trailing_pe,
                      eps_growth: f?.eps_growth, next_earnings_date: f?.next_earnings_date,
                    });
                    const sl = assessStopLoss(ret, stopPct);
                    const tp = assessTakeProfit(ret, profitPct);
                    const editing = edit?.ticker === h.ticker;
                    return (
                      <tr key={h.ticker}>
                        <td>
                          {editing ? (
                            <input className="login-input" style={{ padding: "4px 6px" }} value={edit!.name}
                              onChange={(ev) => setEdit({ ...edit!, name: ev.target.value })} />
                          ) : (
                            <Link href={`/portfolio/${encodeURIComponent(h.ticker)}`}>
                              <span className="domain-name">{(h.name && h.name !== h.ticker) ? h.name : (themeMap.get(h.ticker)?.name ?? h.ticker)}</span>
                              <span className="ticker">{h.is_fund ? `投信 ・ 代用 ${h.ticker}` : h.ticker}</span>
                            </Link>
                          )}
                        </td>
                        <td className="num">
                          {editing && h.is_fund ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                              <input className="login-input" style={{ padding: "4px 6px", width: 100 }} type="number" step="any" placeholder="取得額"
                                value={edit!.principal} onChange={(ev) => setEdit({ ...edit!, principal: ev.target.value })} />
                              <input className="login-input" style={{ padding: "4px 6px", width: 130 }} type="date" title="取得日"
                                value={edit!.acquired_on} onChange={(ev) => setEdit({ ...edit!, acquired_on: ev.target.value })} />
                            </div>
                          ) : editing ? (
                            <input className="login-input" style={{ padding: "4px 6px", width: 90 }} type="number" step="any"
                              value={edit!.avg_cost} onChange={(ev) => setEdit({ ...edit!, avg_cost: ev.target.value })} />
                          ) : h.is_fund
                            ? <span title={`取得額（投資元本）／取得日 ${h.acquired_on ?? "—"}`}>{money(h.principal ?? null, h.currency)}</span>
                            : money(h.avg_cost, h.currency)}
                        </td>
                        <td className="num">
                          {editing ? (
                            <input className="login-input" style={{ padding: "4px 6px", width: 70 }} type="number" step="any"
                              value={edit!.shares} onChange={(ev) => setEdit({ ...edit!, shares: ev.target.value })} />
                          ) : (h.shares ?? "—")}
                        </td>
                        <td className="num">{money(close, h.currency)}</td>
                        <td className="num" style={{ color: ret == null ? undefined : ret >= 0 ? "#15a34a" : "#dc2626", fontWeight: sl.triggered ? 700 : 400 }}>{pct(ret)}</td>
                        <td className="num">
                          {m?.aiba_score == null
                            ? <span style={{ color: "var(--muted)" }}>—</span>
                            : <span className="combo-pill" style={{ background: scoreColor(m.aiba_score) }}>{Math.round(m.aiba_score)}</span>}
                        </td>
                        <td className="num">
                          {m?.overheat == null ? "—" : <span className="combo-pill" style={{ background: overheatColor(m.overheat) }}>{Math.round(m.overheat)}</span>}
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <span className={`sell-badge ${a.badge.cls}`} title={a.tooltip}>{a.badge.label}</span>
                            {sl.triggered && <span className="sell-badge sb-stop" title={sl.tooltip}>{sl.label}</span>}
                            {tp.triggered && <span className="sell-badge sb-profit" title={tp.tooltip}>{tp.label}</span>}
                          </div>
                        </td>
                        <td>
                          {editing ? (
                            <>
                              <button className="authbar-btn" onClick={onSaveEdit}>保存</button>{" "}
                              <button className="authbar-btn" onClick={() => setEdit(null)}>取消</button>
                            </>
                          ) : (
                            <>
                              <button className="authbar-btn" onClick={() => setEdit({ ticker: h.ticker, name: h.name ?? "", avg_cost: h.avg_cost?.toString() ?? "", shares: h.shares?.toString() ?? "", is_fund: !!h.is_fund, principal: h.principal?.toString() ?? "", acquired_on: h.acquired_on ?? "" })}>編集</button>{" "}
                              <button className="authbar-btn" onClick={async () => { await deleteHolding(h.ticker); reload(); }}>削除</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {holdings.length > 0 && (() => {
            const upcoming = holdings
              .map((h) => {
                const d = funds.get(h.ticker)?.next_earnings_date ?? null;
                const days = daysUntil(d);
                const displayName = (h.name && h.name !== h.ticker) ? h.name : (themeMap.get(h.ticker)?.name ?? h.ticker);
                return { ticker: h.ticker, name: displayName, date: d, days };
              })
              .filter((x) => x.date && x.days != null && x.days >= 0)
              .sort((a, b) => a.days! - b.days!);
            if (upcoming.length === 0) return null;
            return (
              <div style={{ marginTop: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>今後の決算予定</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {upcoming.map(({ ticker, name, date, days }) => {
                    const color = days! <= 7 ? "#dc2626" : days! <= 30 ? "#d97706" : "var(--muted)";
                    return (
                      <Link key={ticker} href={`/portfolio/${encodeURIComponent(ticker)}`}
                        style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-2)", textDecoration: "none", color: "inherit", minWidth: 130 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{name}<span className="ticker" style={{ marginLeft: 6 }}>{ticker}</span></span>
                        <span style={{ fontSize: 12, color, fontWeight: days! <= 30 ? 700 : 400 }}>{date}（あと{days}日）</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {holdings.length > 0 && histories.size > 0 && (
            <PortfolioChart holdings={holdings} histories={histories} acwi={acwiHistory} />
          )}

          {holdings.length > 0 && (() => {
            const stockHoldings = holdings.filter((h) => !h.is_fund);
            const hasGrowthData = stockHoldings.some((h) => {
              const f = funds.get(h.ticker);
              return f?.psr != null || f?.gross_margin != null || f?.revenue_growth != null
                || f?.burn_rate_monthly != null || f?.cash_runway_months != null;
            });
            if (!hasGrowthData) return null;

            function fmtPct(v: number | null | undefined) {
              if (v == null) return <span style={{ color: "var(--muted)" }}>—</span>;
              const pct = v * 100;
              const color = pct >= 30 ? "#34d399" : pct >= 0 ? "#60a5fa" : "#f87171";
              return <span style={{ color, fontWeight: 600 }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
            }
            function fmtGrossMargin(v: number | null | undefined) {
              if (v == null) return <span style={{ color: "var(--muted)" }}>—</span>;
              const pct = v * 100;
              const color = pct >= 60 ? "#34d399" : pct >= 40 ? "#2dd4bf" : pct >= 20 ? "#60a5fa" : "#fbbf24";
              return <span style={{ color, fontWeight: 600 }}>{pct.toFixed(1)}%</span>;
            }
            function fmtBurn(v: number | null | undefined, currency: "JPY" | "USD") {
              if (v == null) return <span style={{ color: "var(--muted)" }}>—</span>;
              const s = currency === "JPY"
                ? v >= 1e8 ? `¥${(v / 1e8).toFixed(1)}億/月` : `¥${(v / 1e6).toFixed(0)}百万/月`
                : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B/月` : `$${(v / 1e6).toFixed(0)}M/月`;
              return <span style={{ color: "#f87171" }}>{s}</span>;
            }
            function fmtRunway(v: number | null | undefined) {
              if (v == null) return <span style={{ color: "var(--muted)" }}>—</span>;
              const m = Math.round(v);
              const color = m < 12 ? "#f87171" : m < 18 ? "#fbbf24" : "#34d399";
              return <span style={{ color, fontWeight: 700 }}>{m}ヶ月</span>;
            }

            return (
              <div style={{ marginTop: 28 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>グロース・キャッシュ指標</h2>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
                  ハイリスク・グロース銘柄の買い再評価用。バーンレートは年次営業CFの月次換算（概算）。
                </p>
                <div className="table-scroll">
                  <table className="table">
                    <thead><tr>
                      <th>銘柄</th>
                      <th className="num">PSR</th>
                      <th className="num">粗利率</th>
                      <th className="num">売上成長率</th>
                      <th className="num">バーンレート</th>
                      <th className="num">ランウェイ</th>
                    </tr></thead>
                    <tbody>
                      {stockHoldings.map((h) => {
                        const f = funds.get(h.ticker);
                        const displayName = (h.name && h.name !== h.ticker) ? h.name : (themeMap.get(h.ticker)?.name ?? h.ticker);
                        return (
                          <tr key={h.ticker}>
                            <td>
                              <span className="domain-name">{displayName}</span>
                              <span className="ticker">{h.ticker}</span>
                            </td>
                            <td className="num">
                              {f?.psr == null
                                ? <span style={{ color: "var(--muted)" }}>—</span>
                                : <span>{f.psr.toFixed(1)}倍</span>}
                            </td>
                            <td className="num">{fmtGrossMargin(f?.gross_margin)}</td>
                            <td className="num">{fmtPct(f?.revenue_growth)}</td>
                            <td className="num">{fmtBurn(f?.burn_rate_monthly, h.currency)}</td>
                            <td className="num">{fmtRunway(f?.cash_runway_months)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {holdings.length > 0 && (
            <AllocationAnalysis holdings={holdings} metrics={metrics} themeMap={themeMap} />
          )}

          <p className="guide-note" style={{ marginTop: 14 }}>
            ※ 監視ユニバースの銘柄は追加後すぐにスコア（過熱度・売りシグナル）が表示されます。ユニバース外の銘柄は翌営業日の日次バッチで反映、決算・PER等も同様。
            売りシグナル＝テクニカル過熱＋ファンダ（割高/減益）＋決算接近。
          </p>
          <p className="guide-note">
            ※ <strong>投信</strong>は基準価額の無料安定APIが無いため、<strong>同じ指数を追う代用ETF/指数</strong>で評価します（例: eMAXIS Slim 米国株式→VOO等）。
            インデックス投信なら指数が同じなのでスコア・シグナルは妥当。損益・評価は<strong>代用ETFの取得日からのリターンで概算</strong>（手数料・為替ヘッジ・分配金の差は未考慮）。口数は記録用です。
          </p>
          <p className="guide-note">
            ※ <strong>損切り検討</strong>＝取得単価からの下落率が損切りラインを超えた状態。過熱度ベースの売りシグナルは
            <strong>高値圏（売り時）を捉える一方、株価下落は「🟢継続」となり塩漬けを見逃す</strong>ため、含み損ベースの独立基準として併設。
            機械的な損切りはテーマの構造的成長を取りに行く長期保有方針とは相反するので、方針に応じて目安としてご利用ください（取得単価未入力の銘柄は判定対象外）。
            <strong>利確検討</strong>＝取得単価から利確ラインを超えて上昇した状態。含み益確定の目安（ただし大化けを逃す面もあるため一部利確など柔軟に）。
          </p>
        </>
      )}
    </main>
  );
}
