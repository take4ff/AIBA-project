"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

// 記録日ごとの「買い判定 / 全体平均」の 1/3/6ヶ月先リターン[%]（フラットキー）
export interface SnapPoint {
  date: string;
  buy_1m: number | null; buy_3m: number | null; buy_6m: number | null; buy_12m: number | null;
  all_1m: number | null; all_3m: number | null; all_6m: number | null; all_12m: number | null;
}

const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };

const LINES: { key: keyof SnapPoint; name: string; color: string; dash?: string }[] = [
  { key: "buy_1m", name: "買い 1ヶ月", color: "#4ade80" },
  { key: "buy_3m", name: "買い 3ヶ月", color: "#22c55e" },
  { key: "buy_6m", name: "買い 6ヶ月", color: "#15a34a" },
  { key: "buy_12m", name: "買い 12ヶ月", color: "#166534" },
  { key: "all_1m", name: "ユニバース平均 1ヶ月", color: "#cbd5e1", dash: "4 3" },
  { key: "all_3m", name: "ユニバース平均 3ヶ月", color: "#94a3b8", dash: "4 3" },
  { key: "all_6m", name: "ユニバース平均 6ヶ月", color: "#64748b", dash: "4 3" },
  { key: "all_12m", name: "ユニバース平均 12ヶ月", color: "#475569", dash: "4 3" },
];

export default function SnapshotChart({ data }: { data: SnapPoint[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  if (data.length < 2) return null;

  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#71767f" fontSize={11} />
          <YAxis stroke="#71767f" fontSize={12} tickFormatter={(v: number) => `${v}%`} />
          <ReferenceLine y={0} stroke="#cbd2da" />
          <Tooltip contentStyle={TOOLTIP}
            formatter={(v: number, name: string) => [v == null ? "—" : `${v.toFixed(2)}%`, name]} />
          <Legend
            onClick={(o: any) => toggle(String(o.dataKey))}
            wrapperStyle={{ cursor: "pointer", fontSize: 12 }}
            formatter={(value: string, entry: any) => (
              <span style={{ textDecoration: hidden[entry?.dataKey] ? "line-through" : "none", opacity: hidden[entry?.dataKey] ? 0.4 : 1 }}>{value}</span>
            )} />
          {LINES.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color}
              strokeWidth={l.key.startsWith("buy") ? 2.4 : 1.4} strokeDasharray={l.dash}
              dot={false} connectNulls hide={!!hidden[l.key]} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        各記録日に「買い判定だった銘柄」を買った場合の先行リターン推移（実線＝買い／破線＝全体）。
        <strong>凡例をクリックで表示/非表示</strong>を切替。緑が灰を上回るほど優位。直近は経過待ちで線が途切れます。
      </p>
    </div>
  );
}
