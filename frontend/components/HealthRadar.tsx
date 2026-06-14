"use client";

import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from "recharts";

export interface RadarPoint { axis: string; value: number }

export default function HealthRadar({ data }: { data: RadarPoint[] }) {
  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#e6e8ec" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#16191f", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="#2456e6" fill="#2456e6" fillOpacity={0.35} />
          <Tooltip
            contentStyle={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" }}
            formatter={(v: number) => v?.toFixed(0)} />
        </RadarChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        外側ほど良好（0–100）。各スコアの強み・弱みを一目で把握。
      </p>
    </div>
  );
}
