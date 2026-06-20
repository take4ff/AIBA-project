"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { SnapshotRow, BenchmarkPoint } from "@/lib/data";
import { RankingRow } from "@/lib/types";
import { parseDomainId } from "@/lib/regions";

type Variant = "ge60" | "top20" | "diversified" | "core_lt";
const ENTER_LT = 65, EXIT_LT = 45;  // コア長期: 組入/除外のヒステリシス閾値
const VARIANTS: { key: Variant; label: string; desc: string }[] = [
  { key: "core_lt", label: "コア長期（低入替）", desc: `AIBA≥${ENTER_LT}で組入、${EXIT_LT}を割るまで保有。ヒステリシスで入替を大幅に抑え、勝ち銘柄を長く握る長期保有型。` },
  { key: "ge60", label: "AIBA≥60 全銘柄", desc: "毎月 AIBA≥60 を等ウェイト保有・入替（該当無しは現金）。検証で頑健だった水準。" },
  { key: "top20", label: "AIBA上位20", desc: "毎月 AIBA上位20銘柄を等ウェイト。常にフル投資・銘柄数一定。" },
  { key: "diversified", label: "地域・テーマ分散", desc: "各テーマからAIBA最上位を1銘柄ずつ。業界偏重を抑えた分散型。" },
];
const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const yen = (n: number) => "¥" + Math.round(n).toLocaleString();

// variant に応じてその月の保有銘柄を選ぶ（AIBA降順で返す）。
function selectByVariant(rows: SnapshotRow[], variant: Variant): SnapshotRow[] {
  let picked: SnapshotRow[];
  if (variant === "ge60") {
    picked = rows.filter((r) => (r.aiba_score as number) >= 60);
  } else if (variant === "top20") {
    picked = [...rows].sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number)).slice(0, 20);
  } else {
    const best = new Map<string, SnapshotRow>();
    for (const r of rows) {
      const theme = r.domain_id ? parseDomainId(r.domain_id).theme : "?";
      const cur = best.get(theme);
      if (!cur || (r.aiba_score as number) > (cur.aiba_score as number)) best.set(theme, r);
    }
    picked = [...best.values()];
  }
  return picked.sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number));
}

export default function AibaIndexView({
  snaps, rows, bench, usdjpy,
}: { snaps: SnapshotRow[]; rows: RankingRow[]; bench: BenchmarkPoint[]; usdjpy: number }) {
  const [variant, setVariant] = useState<Variant>("core_lt");
  const [monthly, setMonthly] = useState(30000);

  const dates = useMemo(() => Array.from(new Set(snaps.map((s) => s.snapshot_date))).sort(), [snaps]);

  // 月別のスナップショット行（aiba有のみ）
  const byDate = useMemo(() => {
    const m = new Map<string, SnapshotRow[]>();
    for (const s of snaps) {
      if (s.aiba_score == null) continue;
      const arr = m.get(s.snapshot_date); if (arr) arr.push(s); else m.set(s.snapshot_date, [s]);
    }
    return m;
  }, [snaps]);

  // 月別の保有銘柄（AIBA降順）。コア長期はヒステリシスで状態を持ち越す（低入替）。
  const perMonth = useMemo(() => {
    const res = new Map<string, SnapshotRow[]>();
    if (variant === "core_lt") {
      const held = new Set<string>();
      for (const d of dates) {
        const rs = byDate.get(d) ?? [];
        const avail = new Map<string, SnapshotRow>(rs.filter((r) => r.domain_id).map((r) => [r.domain_id as string, r]));
        for (const id of [...held]) { const r = avail.get(id); if (!r || (r.aiba_score as number) < EXIT_LT) held.delete(id); }  // 除外
        for (const r of rs) if (r.domain_id && (r.aiba_score as number) >= ENTER_LT) held.add(r.domain_id);                     // 組入
        res.set(d, [...held].map((id) => avail.get(id)).filter((x): x is SnapshotRow => !!x).sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number)));
      }
    } else {
      for (const d of dates) res.set(d, selectByVariant(byDate.get(d) ?? [], variant));
    }
    return res;
  }, [byDate, dates, variant]);

  // 保有銘柄群の翌1ヶ月リターン平均（％）。空=現金0、評価未済=null（直近月で打ち切り）。
  const monthRetOf = (held: SnapshotRow[]): number | null => {
    if (held.length === 0) return 0;
    const rets = held.map((r) => r.ret_1m).filter((x): x is number => x != null);
    return rets.length ? mean(rets) : null;
  };

  // 月次インデックス系列（100スタート）＋ ACWI を同窓で連結
  const series = useMemo(() => {
    const benchClose = (d: string): number | null => {
      let c: number | null = null;
      for (const b of bench) { if (b.trade_date <= d) c = b.close; else break; }
      return c;
    };
    const out: { date: string; idx: number; acwi: number | null }[] = [];
    let v = 100, ei = 100; let idxStarted = false;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const mr = monthRetOf(perMonth.get(d) ?? []);
      if (mr == null) break; // 直近の未評価月で打ち切り
      v *= 1 + mr / 100;
      const c0 = benchClose(d), c1 = dates[i + 1] ? benchClose(dates[i + 1]) : null;
      if (c0 != null) { idxStarted = true; if (c1 != null) ei *= c1 / c0; }
      out.push({ date: d, idx: Math.round(v * 10) / 10, acwi: idxStarted ? Math.round(ei * 10) / 10 : null });
    }
    return out;
  }, [perMonth, dates, bench]);

  // 積立シミュレーション（毎月 monthly 円をインデックス値で購入）
  const sim = useMemo(() => {
    if (series.length < 2) return null;
    const n = series.length;
    let units = 0;
    for (const p of series) units += monthly / p.idx;           // 各月のインデックス値で購入
    const last = series[n - 1].idx;
    const invested = monthly * n;
    const dcaValue = units * last;
    const lumpValue = (invested / series[0].idx) * last;         // 同額を初月に一括
    // ACWI に同条件で積立
    const acwiPts = series.filter((p) => p.acwi != null) as { acwi: number }[];
    let acwiVal: number | null = null;
    if (acwiPts.length >= 2) {
      let u = 0; for (const p of acwiPts) u += monthly / p.acwi;
      acwiVal = u * acwiPts[acwiPts.length - 1].acwi;
    }
    return { n, invested, dcaValue, lumpValue, acwiVal };
  }, [series, monthly]);

  // 現在の構成銘柄。コア長期は最新月のヒステリシス保有集合、他は最新AIBAにルール適用。
  const holdings = useMemo(() => {
    const valid = rows.filter((r) => r.aiba_score != null);
    if (variant === "core_lt") {
      const last = dates.at(-1);
      const held = last ? (perMonth.get(last) ?? []) : [];
      const rmap = new Map(rows.map((r) => [r.domain_id, r]));
      return held.map((h) => rmap.get(h.domain_id as string)).filter((x): x is RankingRow => !!x)
        .sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number));
    }
    if (variant === "ge60") return valid.filter((r) => (r.aiba_score as number) >= 60).sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number));
    if (variant === "top20") return [...valid].sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number)).slice(0, 20);
    const best = new Map<string, RankingRow>();
    for (const r of valid) {
      const cur = best.get(r.theme_name);
      if (!cur || (r.aiba_score as number) > (cur.aiba_score as number)) best.set(r.theme_name, r);
    }
    return [...best.values()].sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number));
  }, [rows, variant, perMonth, dates]);

  // 現在の構成から見て「前回から外れた＝売った」銘柄。コア長期は holdings が最新月なので前月(-2)、
  // 他バリアントは holdings がライブAIBAなので最新スナップ(-1)と比較する。
  const soldSincePrev = useMemo(() => {
    const prevDate = variant === "core_lt" ? dates.at(-2) : dates.at(-1);
    const prev = prevDate ? (perMonth.get(prevDate) ?? []) : [];
    const curIds = new Set(holdings.map((h) => h.domain_id));
    const rmap = new Map(rows.map((r) => [r.domain_id, r]));
    return prev
      .filter((p) => p.domain_id && !curIds.has(p.domain_id))
      .map((p) => rmap.get(p.domain_id as string))
      .filter((x): x is RankingRow => !!x)
      .sort((a, b) => (b.aiba_score as number ?? 0) - (a.aiba_score as number ?? 0));
  }, [variant, dates, perMonth, holdings, rows]);

  // 過去の構成（月別・AIBA順）＋前月比の IN(新規)/OUT(除外=売り)。
  const monthlyComp = useMemo(() => {
    const nm = new Map(rows.map((r) => [r.domain_id, { name: r.domain_name, ticker: r.ticker }]));
    const nameOf = (id?: string) => (id ? (nm.get(id)?.name ?? id) : "?");
    const TOP = 10;
    // 各月のフル構成（共有 perMonth を使用＝コア長期のヒステリシスも反映）
    const months = dates.map((d) => ({ date: d, picked: perMonth.get(d) ?? [] }));
    return months.map((m, i) => {
      const prev = i > 0 ? months[i - 1].picked : [];
      const prevSet = new Set(prev.map((p) => p.domain_id));
      const thisSet = new Set(m.picked.map((p) => p.domain_id));
      const items = m.picked.slice(0, TOP).map((p) => ({
        id: p.domain_id, name: nameOf(p.domain_id), ticker: p.domain_id ? (nm.get(p.domain_id)?.ticker ?? "") : "",
        aiba: Math.round(p.aiba_score as number), isNew: i > 0 && !prevSet.has(p.domain_id),
      }));
      const outItems = i > 0 ? prev.filter((p) => !thisSet.has(p.domain_id)).map((p) => ({ id: p.domain_id, name: nameOf(p.domain_id) })) : [];
      return { date: m.date, items, outItems };
    }).reverse();
  }, [perMonth, dates, rows]);

  // 積立額を等ウェイト配分し、各銘柄の買付株数を整数で算出。端数・不足は上位(AIBA順)優先で充当。
  const buyPlan = useMemo(() => {
    const N = holdings.length;
    if (N === 0) return null;
    const perStock = monthly / N;
    const items = holdings.map((h) => {
      const priceJPY = h.close_price == null ? null : (h.region === "jp" ? h.close_price : h.close_price * usdjpy);
      const shares = priceJPY && priceJPY > 0 ? Math.floor(perStock / priceJPY) : 0;
      return { id: h.domain_id, priceJPY, shares };
    });
    let leftover = monthly - items.reduce((a, it) => a + (it.priceJPY ? it.shares * it.priceJPY : 0), 0);
    // 上位優先：rank順に1株ずつ周回して余りを充当（買えなくなるまで）
    let bought = true;
    while (bought) {
      bought = false;
      for (const it of items) {
        if (it.priceJPY && it.priceJPY <= leftover) { it.shares++; leftover -= it.priceJPY; bought = true; }
      }
    }
    return { map: new Map(items.map((it) => [it.id, it])), spent: monthly - leftover, leftover };
  }, [holdings, monthly, usdjpy]);

  const last = series.at(-1);
  const vsAcwi = last && last.acwi != null ? last.idx - last.acwi : null;

  return (
    <>
      <div className="kind-toggle" style={{ marginBottom: 14 }}>
        {VARIANTS.map((v) => (
          <button key={v.key} type="button" className={`kind-btn${variant === v.key ? " kind-active" : ""}`} onClick={() => setVariant(v.key)}>{v.label}</button>
        ))}
      </div>
      <p className="layer-subtitle">{VARIANTS.find((v) => v.key === variant)!.desc}</p>

      {series.length < 2 ? (
        <div className="notice">インデックスを構成するデータが不足しています（定点記録の蓄積待ち）。</div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginTop: 8 }}>
            <div className="stat"><div className="stat-label">期間</div><div className="stat-val" style={{ fontSize: 15 }}>{series[0].date} 〜 {last!.date}</div></div>
            <div className="stat"><div className="stat-label">インデックス（100→）</div><div className="stat-val pos">{last!.idx.toFixed(0)}</div></div>
            <div className="stat"><div className="stat-label">全世界株ACWI（100→）</div><div className="stat-val">{last!.acwi?.toFixed(0) ?? "—"}</div></div>
            <div className="stat"><div className="stat-label">対ACWI 超過</div><div className="stat-val pos">{vsAcwi == null ? "—" : (vsAcwi >= 0 ? "+" : "") + vsAcwi.toFixed(0)}</div></div>
          </div>

          <div className="chart-wrap" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#71767f" fontSize={11} />
                <YAxis stroke="#71767f" fontSize={12} domain={["auto", "auto"]} />
                <ReferenceLine y={100} stroke="#cbd2da" />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: number, n: string) => [v?.toFixed(1), n]} />
                <Legend />
                <Line type="monotone" dataKey="idx" name="AIBAインデックス" stroke="#15a34a" strokeWidth={2.6} dot={false} connectNulls />
                <Line type="monotone" dataKey="acwi" name="全世界株ACWI" stroke="#2456e6" strokeWidth={1.8} strokeDasharray="5 3" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <section className="layer" style={{ marginTop: 20 }}>
            <h2 className="layer-title">積立シミュレーション</h2>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              毎月の積立額
              <input className="login-input" type="number" min={1000} step={1000} value={monthly}
                onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} style={{ width: 110, padding: "4px 6px" }} /> 円
            </label>
            {sim && (
              <div className="stat-grid" style={{ marginTop: 10 }}>
                <div className="stat"><div className="stat-label">投資総額（{sim.n}ヶ月）</div><div className="stat-val">{yen(sim.invested)}</div></div>
                <div className="stat"><div className="stat-label">評価額（毎月積立）</div><div className="stat-val pos">{yen(sim.dcaValue)}（{((sim.dcaValue / sim.invested - 1) * 100).toFixed(0)}%）</div></div>
                <div className="stat"><div className="stat-label">参考：初月に一括</div><div className="stat-val">{yen(sim.lumpValue)}</div></div>
                <div className="stat"><div className="stat-label">参考：ACWI積立</div><div className="stat-val">{sim.acwiVal == null ? "—" : yen(sim.acwiVal)}</div></div>
              </div>
            )}
            <p className="guide-note" style={{ marginTop: 8 }}>
              ※ 過去のインデックス値に毎月一定額を投じた場合の試算（手数料・税・約定誤差・分配金は未考慮）。過去の成績は将来を保証しません。
            </p>
          </section>

          <section className="layer" style={{ marginTop: 20 }}>
            <h2 className="layer-title">現在の構成銘柄（{holdings.length}）</h2>
            <p className="layer-subtitle">
              最新AIBAに同じルールを適用した、いま組み入れ対象の銘柄。<strong>毎月 {yen(monthly)} を等ウェイト配分</strong>した場合の買付株数も表示（端数・不足分は上位銘柄を優先）。
              {buyPlan && <>　→ 買付 <strong>{yen(buyPlan.spent)}</strong>・余り {yen(buyPlan.leftover)}</>}
            </p>
            {holdings.length === 0 ? (
              <div className="notice">現在の基準を満たす銘柄がありません（AIBA≥60該当なし＝現金）。</div>
            ) : (
              <div className="hh-grid">
                {holdings.map((r) => {
                  const b = buyPlan?.map.get(r.domain_id);
                  return (
                    <Link key={r.domain_id} href={`/domain/${r.domain_id}`} className="tech-sig idx-holding" title={`${r.theme_name}（クリックで詳細）`}>
                      <span className="tech-sig-name">{r.domain_name}<span className="ticker" style={{ marginLeft: 6 }}>{r.ticker}</span></span>
                      <span className="tech-sig-row2">
                        <span className="tech-sig-verdict" style={{ color: "#15a34a" }}>{(r.aiba_score as number).toFixed(0)}</span>
                        {b && <span style={{ fontWeight: 700, color: b.shares > 0 ? "var(--ink)" : "var(--muted)" }}>{b.shares}株</span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
            {soldSincePrev.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h3 style={{ fontSize: 14, margin: "0 0 6px", color: "#dc2626" }}>前回から外れた銘柄（＝売り）{soldSincePrev.length}</h3>
                <p className="layer-subtitle" style={{ marginTop: 0 }}>
                  前回の構成にあったが、最新の基準では組み入れ対象から外れた銘柄（カッコ内は現在のAIBA＝閾値割れの度合い）。
                </p>
                <div className="hh-grid">
                  {soldSincePrev.map((r) => (
                    <Link key={r.domain_id} href={`/domain/${r.domain_id}`} className="tech-sig idx-holding" title={`${r.theme_name}（クリックで詳細）`}>
                      <span className="tech-sig-name">{r.domain_name}<span className="ticker" style={{ marginLeft: 6 }}>{r.ticker}</span></span>
                      <span className="tech-sig-row2">
                        <span className="tech-sig-verdict" style={{ color: "#dc2626" }}>{r.aiba_score == null ? "—" : (r.aiba_score as number).toFixed(0)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="layer" style={{ marginTop: 20 }}>
            <h2 className="layer-title">過去の構成（月別・AIBA順 上位{Math.min(10, monthlyComp[0]?.items.length || 10)}）</h2>
            <p className="layer-subtitle">
              各月末にこのルールで組み入れた銘柄を AIBA 順に表示（直近が上）。
              <span className="mc-new">新</span>＝前月から新規組入（買い）、最終列の <span style={{ color: "#dc2626" }}>除外</span>＝前月にあって外れた銘柄（＝月次リバランスで売り）。
            </p>
            <div className="table-scroll">
              <table className="table idx-month-table">
                <thead>
                  <tr>
                    <th>月</th>
                    {Array.from({ length: 10 }, (_, i) => <th key={i} className="num">{i + 1}位</th>)}
                    <th className="num">除外（売り）</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyComp.map((m) => (
                    <tr key={m.date}>
                      <td className="date" style={{ whiteSpace: "nowrap" }}>{m.date.slice(0, 7)}</td>
                      {Array.from({ length: 10 }, (_, i) => {
                        const it = m.items[i];
                        return (
                          <td key={i} className="num">
                            {it ? (
                              it.id
                                ? <Link href={`/domain/${it.id}`} className="idx-mc-link" title={`${it.ticker} ・ AIBA ${it.aiba}（クリックで詳細）`}>{it.isNew && <span className="mc-new">新</span>}{it.name}<span className="idx-mc-aiba"> {it.aiba}</span></Link>
                                : <span title={`${it.ticker} ・ AIBA ${it.aiba}`}>{it.isNew && <span className="mc-new">新</span>}{it.name}<span className="idx-mc-aiba"> {it.aiba}</span></span>
                            ) : ""}
                          </td>
                        );
                      })}
                      <td className="num mc-out">
                        {m.outItems.length === 0 ? "—" : (
                          m.outItems.slice(0, 6).map((o, i) => (
                            <span key={o.id ?? i}>
                              {i > 0 && "・"}
                              {o.id ? <Link href={`/domain/${o.id}`} className="idx-mc-link" title="クリックで詳細">{o.name}</Link> : o.name}
                            </span>
                          )).concat(m.outItems.length > 6 ? [<span key="more"> 他{m.outItems.length - 6}</span>] : [])
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
