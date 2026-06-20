"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { SnapshotRow, BenchmarkPoint } from "@/lib/data";
import { RankingRow } from "@/lib/types";
import { parseDomainId } from "@/lib/regions";

type Variant = "ge60" | "top20" | "diversified";
const VARIANTS: { key: Variant; label: string; desc: string }[] = [
  { key: "ge60", label: "AIBA≥60 全銘柄", desc: "毎月 AIBA≥60 を等ウェイト保有・入替（該当無しは現金）。検証で頑健だった水準。" },
  { key: "top20", label: "AIBA上位20", desc: "毎月 AIBA上位20銘柄を等ウェイト。常にフル投資・銘柄数一定。" },
  { key: "diversified", label: "地域・テーマ分散", desc: "各テーマからAIBA最上位を1銘柄ずつ。業界偏重を抑えた分散型。" },
];
const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const yen = (n: number) => "¥" + Math.round(n).toLocaleString();

// 1ヶ月コホート選択：variant に応じてその月の保有銘柄の ret_1m 平均（％）を返す
function monthReturn(rows: SnapshotRow[], variant: Variant): number | null {
  const withRet = rows.filter((r) => r.ret_1m != null && r.aiba_score != null);
  if (withRet.length === 0) return null;
  let picked: SnapshotRow[];
  if (variant === "ge60") {
    picked = withRet.filter((r) => (r.aiba_score as number) >= 60);
    if (picked.length === 0) return 0; // 該当無し＝現金（0%）
  } else if (variant === "top20") {
    picked = [...withRet].sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number)).slice(0, 20);
  } else {
    const best = new Map<string, SnapshotRow>();
    for (const r of withRet) {
      const theme = r.domain_id ? parseDomainId(r.domain_id).theme : "?";
      const cur = best.get(theme);
      if (!cur || (r.aiba_score as number) > (cur.aiba_score as number)) best.set(theme, r);
    }
    picked = [...best.values()];
  }
  return mean(picked.map((r) => r.ret_1m as number));
}

export default function AibaIndexView({
  snaps, rows, bench,
}: { snaps: SnapshotRow[]; rows: RankingRow[]; bench: BenchmarkPoint[] }) {
  const [variant, setVariant] = useState<Variant>("ge60");
  const [monthly, setMonthly] = useState(30000);

  const dates = useMemo(() => Array.from(new Set(snaps.map((s) => s.snapshot_date))).sort(), [snaps]);

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
      const mr = monthReturn(snaps.filter((s) => s.snapshot_date === d), variant);
      if (mr == null) break; // 直近の未評価月で打ち切り
      v *= 1 + mr / 100;
      const c0 = benchClose(d), c1 = dates[i + 1] ? benchClose(dates[i + 1]) : null;
      if (c0 != null) { idxStarted = true; if (c1 != null) ei *= c1 / c0; }
      out.push({ date: d, idx: Math.round(v * 10) / 10, acwi: idxStarted ? Math.round(ei * 10) / 10 : null });
    }
    return out;
  }, [snaps, dates, bench, variant]);

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

  // 現在の構成銘柄（最新AIBAにルール適用）。ETF/個別株を含む監視ユニバース全体。
  const holdings = useMemo(() => {
    const valid = rows.filter((r) => r.aiba_score != null);
    if (variant === "ge60") return valid.filter((r) => (r.aiba_score as number) >= 60).sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number));
    if (variant === "top20") return [...valid].sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number)).slice(0, 20);
    const best = new Map<string, RankingRow>();
    for (const r of valid) {
      const cur = best.get(r.theme_name);
      if (!cur || (r.aiba_score as number) > (cur.aiba_score as number)) best.set(r.theme_name, r);
    }
    return [...best.values()].sort((a, b) => (b.aiba_score as number) - (a.aiba_score as number));
  }, [rows, variant]);

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
            <p className="layer-subtitle">最新AIBAに同じルールを適用した、いま組み入れ対象の銘柄。等ウェイトを想定。</p>
            {holdings.length === 0 ? (
              <div className="notice">現在の基準を満たす銘柄がありません（AIBA≥60該当なし＝現金）。</div>
            ) : (
              <div className="hh-grid">
                {holdings.map((r) => (
                  <Link key={r.domain_id} href={`/domain/${r.domain_id}`} className="tech-sig idx-holding" title={`${r.theme_name}（クリックで詳細）`}>
                    <span className="tech-sig-name">{r.domain_name}<span className="ticker" style={{ marginLeft: 6 }}>{r.ticker}</span></span>
                    <span className="tech-sig-verdict" style={{ color: "#15a34a", marginLeft: "auto" }}>{(r.aiba_score as number).toFixed(0)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
