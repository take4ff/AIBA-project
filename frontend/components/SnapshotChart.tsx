"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

export interface SnapPoint {
  date: string;          // snapshot_date
  buy: number | null;    // 買い判定の平均 1ヶ月先リターン[%]
  all: number | null;    // 全体平均 1ヶ月先リターン[%]
}

const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };

export default function SnapshotChart({ data }: { data: SnapPoint[] }) {
  const rows = data.filter((d) => d.buy != null || d.all != null);
  if (rows.length < 2) return null;
  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#71767f" fontSize={11} />
          <YAxis stroke="#71767f" fontSize={12} tickFormatter={(v: number) => `${v}%`} />
          <ReferenceLine y={0} stroke="#cbd2da" />
          <Tooltip contentStyle={TOOLTIP}
            formatter={(v: number, name: string) => [v == null ? "—" : `${v.toFixed(2)}%`, name]} />
          <Legend />
          <Line type="monotone" dataKey="buy" name="買い判定(AIBA≥60)" stroke="#15a34a" strokeWidth={2.4} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="all" name="全体平均" stroke="#94a3b8" strokeWidth={1.6} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        各記録日に「買い判定だった銘柄」を買った場合の<strong>1ヶ月先リターン</strong>（緑）と全体平均（灰）の推移。緑が灰を上回るほど優位。
      </p>
    </div>
  );
}
