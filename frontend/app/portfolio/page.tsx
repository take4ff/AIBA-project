"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import NavTabs from "@/components/NavTabs";
import {
  UserHolding, TickerMetric, TickerFundamentals,
  getHoldings, getTickerData, getTickerThemes, addHolding, updateHolding, deleteHolding,
} from "@/lib/user-portfolio";
import { assessSell, money, pct, earningsLabel, overheatColor } from "@/lib/sell-signal";
import { fmt } from "@/lib/score-color";
import AllocationAnalysis from "@/components/AllocationAnalysis";

const EMPTY = { ticker: "", name: "", currency: "JPY" as "JPY" | "USD", avg_cost: "", shares: "" };

export default function PortfolioPage() {
  const { user, ready } = useAuth();
  const [holdings, setHoldings] = useState<UserHolding[]>([]);
  const [metrics, setMetrics] = useState<Map<string, TickerMetric>>(new Map());
  const [funds, setFunds] = useState<Map<string, TickerFundamentals>>(new Map());
  const [themeMap, setThemeMap] = useState<Map<string, { theme: string; label: string; region: string }>>(new Map());
  const [form, setForm] = useState({ ...EMPTY });
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ ticker: string; name: string; avg_cost: string; shares: string } | null>(null);

  const reload = useCallback(async () => {
    const hs = await getHoldings();
    setHoldings(hs);
    const [{ metrics, funds }, tm] = await Promise.all([
      getTickerData(hs.map((h) => h.ticker)),
      getTickerThemes(),
    ]);
    setMetrics(metrics);
    setFunds(funds);
    setThemeMap(tm);
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const ticker = form.ticker.trim();
    if (!ticker) return;
    const msg = await addHolding({
      ticker, name: form.name.trim() || ticker, currency: form.currency,
      avg_cost: form.avg_cost ? Number(form.avg_cost) : null,
      shares: form.shares ? Number(form.shares) : null,
    });
    if (msg) setErr(msg);
    else { setForm({ ...EMPTY }); reload(); }
  }

  async function onSaveEdit() {
    if (!edit) return;
    await updateHolding(edit.ticker, {
      name: edit.name || null,
      avg_cost: edit.avg_cost ? Number(edit.avg_cost) : null,
      shares: edit.shares ? Number(edit.shares) : null,
    });
    setEdit(null);
    reload();
  }

  if (!ready) return <main className="container"><NavTabs active="portfolio" /></main>;

  return (
    <main className="container">
      <header className="header">
        <h1>💼 マイ・ポートフォリオ（売り時）</h1>
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
            <input className="login-input" placeholder="ティッカー（例: NVDA / 8035.T）" value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
            <input className="login-input" placeholder="銘柄名（任意）" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="login-input" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value as "JPY" | "USD" })}>
              <option value="JPY">JPY</option><option value="USD">USD</option>
            </select>
            <input className="login-input" type="number" step="any" placeholder="取得単価" value={form.avg_cost}
              onChange={(e) => setForm({ ...form, avg_cost: e.target.value })} />
            <input className="login-input" type="number" step="any" placeholder="株数（任意）" value={form.shares}
              onChange={(e) => setForm({ ...form, shares: e.target.value })} />
            <button className="kind-active login-submit" type="submit">追加</button>
          </form>
          {err && <p style={{ color: "#dc2626", fontSize: 13 }}>{err}</p>}

          {holdings.length === 0 ? (
            <div className="notice" style={{ marginTop: 12 }}>銘柄を追加してください。指標は翌日の日次バッチで反映されます。</div>
          ) : (
            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table className="table">
                <thead><tr>
                  <th>銘柄</th><th className="num">取得単価</th><th className="num">株数</th><th className="num">現在値</th>
                  <th className="num">損益</th><th className="num">過熱度</th><th>売りシグナル</th>
                  <th>次回決算</th><th>操作</th>
                </tr></thead>
                <tbody>
                  {holdings.map((h) => {
                    const m = metrics.get(h.ticker);
                    const f = funds.get(h.ticker);
                    const close = m?.close_price ?? null;
                    const ret = h.avg_cost && close ? ((close - h.avg_cost) / h.avg_cost) * 100 : null;
                    const a = assessSell({
                      overheat: m?.overheat ?? null,
                      forward_pe: f?.forward_pe, trailing_pe: f?.trailing_pe,
                      eps_growth: f?.eps_growth, next_earnings_date: f?.next_earnings_date,
                    });
                    const e = earningsLabel(f?.next_earnings_date ?? null);
                    const editing = edit?.ticker === h.ticker;
                    return (
                      <tr key={h.ticker}>
                        <td>
                          {editing ? (
                            <input className="login-input" style={{ padding: "4px 6px" }} value={edit!.name}
                              onChange={(ev) => setEdit({ ...edit!, name: ev.target.value })} />
                          ) : (
                            <Link href={`/portfolio/${encodeURIComponent(h.ticker)}`}>
                              <span className="domain-name">{h.name ?? h.ticker}</span>
                              <span className="ticker">{h.ticker}</span>
                            </Link>
                          )}
                        </td>
                        <td className="num">
                          {editing ? (
                            <input className="login-input" style={{ padding: "4px 6px", width: 90 }} type="number" step="any"
                              value={edit!.avg_cost} onChange={(ev) => setEdit({ ...edit!, avg_cost: ev.target.value })} />
                          ) : money(h.avg_cost, h.currency)}
                        </td>
                        <td className="num">
                          {editing ? (
                            <input className="login-input" style={{ padding: "4px 6px", width: 70 }} type="number" step="any"
                              value={edit!.shares} onChange={(ev) => setEdit({ ...edit!, shares: ev.target.value })} />
                          ) : (h.shares ?? "—")}
                        </td>
                        <td className="num">{money(close, h.currency)}</td>
                        <td className="num" style={{ color: ret == null ? undefined : ret >= 0 ? "#15a34a" : "#dc2626" }}>{pct(ret)}</td>
                        <td className="num">
                          {m?.overheat == null ? "—" : <span className="combo-pill" style={{ background: overheatColor(m.overheat) }}>{Math.round(m.overheat)}</span>}
                        </td>
                        <td><span className={`sell-badge ${a.badge.cls}`} title={a.tooltip}>{a.badge.label}</span></td>
                        <td style={{ color: e.soon ? "#d97706" : "var(--muted)", fontWeight: e.soon ? 700 : 400 }}>{e.soon ? "⚠️ " : ""}{e.text}</td>
                        <td>
                          {editing ? (
                            <>
                              <button className="authbar-btn" onClick={onSaveEdit}>保存</button>{" "}
                              <button className="authbar-btn" onClick={() => setEdit(null)}>取消</button>
                            </>
                          ) : (
                            <>
                              <button className="authbar-btn" onClick={() => setEdit({ ticker: h.ticker, name: h.name ?? "", avg_cost: h.avg_cost?.toString() ?? "", shares: h.shares?.toString() ?? "" })}>編集</button>{" "}
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
          {holdings.length > 0 && (
            <AllocationAnalysis holdings={holdings} metrics={metrics} themeMap={themeMap} />
          )}

          <p className="guide-note" style={{ marginTop: 14 }}>
            ※ 過熱度・決算・PER等は翌営業日の日次バッチで反映。売りシグナル＝テクニカル過熱＋ファンダ（割高/減益）＋決算接近。
            投信（基準価額）は対象外、上場ETF/個別株のティッカーを登録してください。
          </p>
        </>
      )}
    </main>
  );
}
