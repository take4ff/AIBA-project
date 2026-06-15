"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

export interface SnapPoint {
  horizon: string;   // "1ヶ月" 等
  buy: number | null;
  all: number | null;
  win: number | null;
  n: number;
}

const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };

export default function SnapshotChart({ data }: { data: SnapPoint[] }) {
  const rows = data.filter((d) => d.buy != null || d.all != null);
  if (rows.length === 0) return null;
  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
          <XAxis dataKey="horizon" stroke="#71767f" fontSize={12} />
          <YAxis stroke="#71767f" fontSize={12} tickFormatter={(v: number) => `${v}%`} />
          <ReferenceLine y={0} stroke="#cbd2da" />
          <Tooltip contentStyle={TOOLTIP}
            formatter={(v: number, name: string) => [v == null ? "—" : `${v.toFixed(2)}%`, name]} />
          <Legend />
          <Bar dataKey="buy" name="買い判定(AIBA≥60)" fill="#15a34a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="all" name="全体平均" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        買い判定（緑）が全体平均（灰）をどれだけ上回るか＝買いシグナルの優位。期間が長いほど優位が拡大。
      </p>
    </div>
  );
}
