"use client";

import { useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from "recharts";
export interface SellMetricRow {
  trade_date: string;
  close_price: number | null;
  rsi_14: number | null;
  overheat: number | null;
}
import PeriodFilter, { PERIODS, Period } from "@/components/PeriodFilter";

const SELL_THRESHOLD = 70; // 過熱度がこれ以上＝売り検討ゾーン

export default function SellChart({
  data,
  currency = "JPY",
}: {
  data: SellMetricRow[];
  currency?: "JPY" | "USD";
}) {
  const [period, setPeriod] = useState<Period>("6M");
  const view = data.slice(-PERIODS[period]);
  const sym = currency === "JPY" ? "¥" : "$";
  const priceFmt = (v: number) =>
    `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // 過熱度が閾値以上の連続区間（売り場）を赤帯で示す
  const bands: { x1: string; x2: string }[] = [];
  let start: string | null = null;
  for (let i = 0; i < view.length; i++) {
    const hot = (view[i].overheat ?? -1) >= SELL_THRESHOLD;
    if (hot && start === null) start = view[i].trade_date;
    if (!hot && start !== null) { bands.push({ x1: start, x2: view[i - 1].trade_date }); start = null; }
  }
  if (start !== null) bands.push({ x1: start, x2: view[view.length - 1].trade_date });

  return (
    <div className="chart-wrap">
      <PeriodFilter value={period} onChange={setPeriod} />
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={view} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pxFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e6ebf5" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#e6ebf5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#263049" strokeDasharray="3 3" />
          <XAxis dataKey="trade_date" stroke="#8b97b3" fontSize={12} />
          <YAxis yAxisId="oh" domain={[0, 100]} stroke="#8b97b3" fontSize={12}
            label={{ value: "過熱度", angle: -90, position: "insideLeft", fill: "#8b97b3", fontSize: 12 }} />
          <YAxis yAxisId="price" orientation="right" stroke="#e6ebf5" fontSize={12}
            domain={["auto", "auto"]} tickFormatter={priceFmt} width={64} />

          {bands.map((b, i) => (
            <ReferenceArea key={i} yAxisId="oh" x1={b.x1} x2={b.x2} y1={0} y2={100}
              fill="#ef4444" fillOpacity={0.1} ifOverflow="extendDomain" />
          ))}
          <ReferenceLine yAxisId="oh" y={SELL_THRESHOLD} stroke="#ef4444" strokeDasharray="5 4"
            strokeOpacity={0.7}
            label={{ value: `売り閾値 ${SELL_THRESHOLD}`, position: "insideTopLeft", fill: "#ef4444", fontSize: 11 }} />

          <Tooltip
            contentStyle={{ background: "#121829", border: "1px solid #263049", borderRadius: 8, color: "#e6ebf5" }}
            formatter={(value: number, name: string) => (name === "株価" ? priceFmt(value) : value?.toFixed(1))} />
          <Legend />

          <Area yAxisId="price" type="monotone" dataKey="close_price" name="株価"
            stroke="#e6ebf5" strokeWidth={2} fill="url(#pxFill)" dot={false} />
          <Line yAxisId="oh" type="monotone" dataKey="overheat" name="過熱度"
            stroke="#ef4444" strokeWidth={2.6} dot={false} />
          <Line yAxisId="oh" type="monotone" dataKey="rsi_14" name="RSI"
            stroke="#8b97b3" strokeWidth={1} strokeDasharray="4 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ color: "#8b97b3", fontSize: 12, marginTop: 10 }}>
        左軸＝過熱度(0-100)、右軸＝株価({currency === "JPY" ? "円" : "ドル"})。
        <span style={{ color: "#ef4444" }}>赤い帯</span>は過熱度が売り閾値({SELL_THRESHOLD})以上＝「売り検討」期間。
      </p>
    </div>
  );
}
