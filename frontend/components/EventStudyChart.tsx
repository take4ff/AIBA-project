"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { SnapshotRow } from "@/lib/data";

type Horizon = "ret_1m" | "ret_3m" | "ret_6m" | "ret_12m";
const HORIZONS: { key: Horizon; label: string }[] = [
  { key: "ret_1m", label: "1ヶ月" },
  { key: "ret_3m", label: "3ヶ月" },
  { key: "ret_6m", label: "6ヶ月" },
  { key: "ret_12m", label: "12ヶ月" },
];

const SCORE_BRACKETS = [
  { label: "<40",   min: -Infinity, max: 40 },
  { label: "40-50", min: 40, max: 50 },
  { label: "50-60", min: 50, max: 60 },
  { label: "60-70", min: 60, max: 70 },
  { label: "70-80", min: 70, max: 80 },
  { label: "80+",   min: 80, max: Infinity },
];

const avg = (arr: number[]) =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

const TOOLTIP_STYLE = {
  background: "#fff", border: "1px solid #e6e8ec",
  borderRadius: 8, color: "#16191f",
};

function retColor(v: number) {
  return v >= 0 ? "#34d399" : "#f87171";
}

export default function EventStudyChart({ snaps }: { snaps: SnapshotRow[] }) {
  const [bracketHorizon, setBracketHorizon] = useState<Horizon>("ret_3m");

  // ① ホライズン比較：買いシグナル vs 全体
  const horizonData = useMemo(() => {
    return HORIZONS.map(({ key, label }) => {
      const buyVals = snaps.filter((r) => r.is_buy && r[key] != null).map((r) => r[key] as number);
      const allVals = snaps.filter((r) => r[key] != null).map((r) => r[key] as number);
      const nonBuyVals = snaps.filter((r) => !r.is_buy && r[key] != null).map((r) => r[key] as number);
      const buyAvg = avg(buyVals);
      const allAvg = avg(allVals);
      const nonBuyAvg = avg(nonBuyVals);
      const buyWin = buyVals.length
        ? Math.round((buyVals.filter((x) => x > 0).length / buyVals.length) * 100)
        : null;
      const edge = buyAvg != null && allAvg != null
        ? Math.round((buyAvg - allAvg) * 10) / 10
        : null;
      return {
        label,
        買いシグナル: buyAvg != null ? Math.round(buyAvg * 10) / 10 : null,
        非買いシグナル: nonBuyAvg != null ? Math.round(nonBuyAvg * 10) / 10 : null,
        勝率: buyWin,
        超過: edge,
        n: buyVals.length,
      };
    });
  }, [snaps]);

  // ② スコア帯別平均リターン
  const bracketData = useMemo(() => {
    return SCORE_BRACKETS.map(({ label, min, max }) => {
      const vals = snaps
        .filter((r) => {
          const s = r.aiba_score;
          return s != null && s >= min && s < max && r[bracketHorizon] != null;
        })
        .map((r) => r[bracketHorizon] as number);
      const mean = avg(vals);
      return {
        label,
        平均リターン: mean != null ? Math.round(mean * 10) / 10 : null,
        n: vals.length,
      };
    });
  }, [snaps, bracketHorizon]);

  // 表示できるデータが十分あるか確認
  const hasData = horizonData.some((d) => d["買いシグナル"] != null);
  if (!hasData) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <h3 className="layer-title" style={{ fontSize: 16 }}>イベントスタディ（買いシグナル後のリターン分析）</h3>
      <p className="layer-subtitle">
        AIBA≥60 の買いシグナル発生時点を起点に、各ホライズンの平均リターンを集計。
        非買いシグナル（AIBA&lt;60）と比較し、スコアの先行性を可視化。
      </p>

      {/* ホライズン比較グラフ */}
      <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          ① ホライズン別 平均リターン比較（買い vs 非買い）
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={horizonData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, name: string) => [`${v?.toFixed(1)}%`, name]}
            />
            <Legend />
            <Bar dataKey="買いシグナル" fill="#34d399" radius={[4, 4, 0, 0]} />
            <Bar dataKey="非買いシグナル" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* 統計サマリー行 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {horizonData.map((d) => d["買いシグナル"] != null && (
            <div key={d.label} style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--panel-2)", fontSize: 12, minWidth: 110,
            }}>
              <div style={{ color: "var(--muted)", marginBottom: 2 }}>{d.label}</div>
              <div style={{ fontWeight: 700, color: retColor(d["買いシグナル"]) }}>
                買い {d["買いシグナル"] >= 0 ? "+" : ""}{d["買いシグナル"]}%
              </div>
              <div style={{ color: "var(--muted)" }}>
                超過 {d.超過 != null ? (d.超過 >= 0 ? "+" : "") + d.超過 + "%" : "—"}
              </div>
              <div style={{ color: "var(--muted)" }}>
                勝率 {d.勝率 != null ? d.勝率 + "%" : "—"}
                <span style={{ marginLeft: 4, fontSize: 10 }}>({d.n}件)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* スコア帯別グラフ */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
            ② AIBAスコア帯別 平均リターン
          </p>
          <div style={{ display: "flex", gap: 4 }}>
            {HORIZONS.map((h) => (
              <button key={h.key} type="button"
                className={bracketHorizon === h.key ? "kind-active" : "kind-btn"}
                onClick={() => setBracketHorizon(h.key)}
                style={{ padding: "2px 10px", fontSize: 12 }}
              >{h.label}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bracketData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: any, _: string, props: any) => {
                const val = v as number | null;
                return val == null
                  ? ["データ不足", "平均リターン"]
                  : [`${val >= 0 ? "+" : ""}${val.toFixed(1)}%（${props.payload.n}件）`, "平均リターン"];
              }}
            />
            <Bar dataKey="平均リターン" radius={[4, 4, 0, 0]}>
              {bracketData.map((d) => (
                <Cell
                  key={d.label}
                  fill={d["平均リターン"] == null ? "#4b5563" : d["平均リターン"] >= 0 ? "#34d399" : "#f87171"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          ※ スコアが高いほど平均リターンが高いほど、AIBAスコアの予測力が高いことを示す。
          件数が少ないブラケットは参考値。
        </p>
      </div>
    </div>
  );
}
