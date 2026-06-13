"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { MetricHistoryRow } from "@/lib/types";

export default function TrendChart({ data }: { data: MetricHistoryRow[] }) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#263049" strokeDasharray="3 3" />
          <XAxis dataKey="trade_date" stroke="#8b97b3" fontSize={12} />
          <YAxis domain={[0, 100]} stroke="#8b97b3" fontSize={12} />
          <Tooltip
            contentStyle={{ background: "#121829", border: "1px solid #263049", borderRadius: 8, color: "#e6ebf5" }}
          />
          <Legend />
          <Line type="monotone" dataKey="aiba_score" name="AIBA" stroke="#34d399" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="technical_score" name="テクニカル" stroke="#5b8cff" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="sentiment_score" name="センチメント" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="rsi_14" name="RSI" stroke="#8b97b3" strokeWidth={1} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
