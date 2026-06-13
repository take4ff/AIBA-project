"use client";

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { MetricHistoryRow } from "@/lib/types";

const priceFmt = (v: number) =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function TrendChart({ data }: { data: MetricHistoryRow[] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e6ebf5" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#e6ebf5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#263049" strokeDasharray="3 3" />
          <XAxis dataKey="trade_date" stroke="#8b97b3" fontSize={12} />

          {/* 左軸: スコア(0-100) */}
          <YAxis
            yAxisId="score"
            domain={[0, 100]}
            stroke="#8b97b3"
            fontSize={12}
            label={{ value: "スコア", angle: -90, position: "insideLeft", fill: "#8b97b3", fontSize: 12 }}
          />
          {/* 右軸: 株価(終値) */}
          <YAxis
            yAxisId="price"
            orientation="right"
            stroke="#e6ebf5"
            fontSize={12}
            domain={["auto", "auto"]}
            tickFormatter={priceFmt}
            width={64}
          />

          <Tooltip
            contentStyle={{ background: "#121829", border: "1px solid #263049", borderRadius: 8, color: "#e6ebf5" }}
            formatter={(value: number, name: string) =>
              name === "株価" ? priceFmt(value) : value?.toFixed(1)
            }
          />
          <Legend />

          {/* 株価: 右軸・面付きで背景的に表示（スコアが先行する様子を重ねて見せる） */}
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="close_price"
            name="株価"
            stroke="#e6ebf5"
            strokeWidth={2}
            fill="url(#priceFill)"
            dot={false}
          />

          {/* AIBAスコア: 主役（左軸・太線） */}
          <Line yAxisId="score" type="monotone" dataKey="aiba_score" name="AIBA" stroke="#34d399" strokeWidth={2.8} dot={false} />
          <Line yAxisId="score" type="monotone" dataKey="technical_score" name="テクニカル" stroke="#5b8cff" strokeWidth={1.4} dot={false} />
          <Line yAxisId="score" type="monotone" dataKey="sentiment_score" name="センチメント" stroke="#f59e0b" strokeWidth={1.4} dot={false} />
          <Line yAxisId="score" type="monotone" dataKey="rsi_14" name="RSI" stroke="#8b97b3" strokeWidth={1} strokeDasharray="4 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ color: "#8b97b3", fontSize: 12, marginTop: 10 }}>
        左軸＝各種スコア(0-100)、右軸＝株価(終値)。AIBA/センチメントの先行と株価の動きを重ねて確認できます。
      </p>
    </div>
  );
}
