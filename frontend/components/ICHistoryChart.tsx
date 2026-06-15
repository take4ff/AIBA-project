"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import ClickableLegend from "@/components/ClickableLegend";

export interface ICPoint {
  run_date: string;
  ic_aiba: number | null;
  ic_technical: number | null;
  ic_sentiment: number | null;
}

const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };

export default function ICHistoryChart({ data }: { data: ICPoint[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  if (data.length < 2) return null; // 2点以上たまるまで非表示（日次で蓄積）

  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
          <XAxis dataKey="run_date" stroke="#71767f" fontSize={11} />
          <YAxis stroke="#71767f" fontSize={12} tickFormatter={(v: number) => v.toFixed(2)} />
          <ReferenceLine y={0} stroke="#cbd2da" />
          <Tooltip contentStyle={TOOLTIP}
            formatter={(v: number, name: string) => [v == null ? "—" : v.toFixed(3), name]} />
          <Legend content={(p: any) => <ClickableLegend {...p} hidden={hidden} onToggle={toggle} />} />
          <Line type="monotone" dataKey="ic_sentiment" name="センチメント" stroke="#d97706" strokeWidth={2.2} dot={{ r: 2 }} connectNulls hide={!!hidden.ic_sentiment} />
          <Line type="monotone" dataKey="ic_aiba" name="AIBA" stroke="#15a34a" strokeWidth={2.2} dot={{ r: 2 }} connectNulls hide={!!hidden.ic_aiba} />
          <Line type="monotone" dataKey="ic_technical" name="テクニカル" stroke="#2456e6" strokeWidth={1.6} dot={false} connectNulls hide={!!hidden.ic_technical} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        クロスセクションICの推移（日次バッチで1点ずつ蓄積）。0より上で先行性あり。先行性が時間を通じて持続するかを評価。
      </p>
    </div>
  );
}
