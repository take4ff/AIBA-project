"use client";

import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend,
} from "recharts";

export interface RadarPoint { axis: string; value: number; avg?: number }

export default function HealthRadar({
  data,
  showAvg = false,
  avgLabel = "業界平均",
}: {
  data: RadarPoint[];
  showAvg?: boolean;        // 業界平均の系列を重ねるか
  avgLabel?: string;        // 業界平均系列の凡例名（件数入り等）
}) {
  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#e6e8ec" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#16191f", fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {showAvg && (
            <Radar name={avgLabel} dataKey="avg" stroke="#9aa0a6" fill="#9aa0a6" fillOpacity={0.18} />
          )}
          <Radar name="この銘柄" dataKey="value" stroke="#2456e6" fill="#2456e6" fillOpacity={0.35} />
          {showAvg && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Tooltip
            contentStyle={{ background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" }}
            formatter={(v: number) => v?.toFixed(0)} />
        </RadarChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        外側ほど良好（0–100）。{showAvg ? "青＝この銘柄／グレー＝同業界の平均。強み・弱みを業界比較で把握。" : "各スコアの強み・弱みを一目で把握。"}
      </p>
    </div>
  );
}
