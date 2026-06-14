"use client";

import { useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from "recharts";
import PeriodFilter, { PERIODS, Period } from "@/components/PeriodFilter";

export interface SellMetricRow {
  trade_date: string;
  close_price: number | null;
  rsi_14: number | null;
  overheat: number | null;
}

const SELL_THRESHOLD = 70;
const C = { grid: "#e6e8ec", axis: "#71767f", price: "#374151", over: "#dc2626", rsi: "#9aa0aa" };
const TOOLTIP = { background: "#ffffff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f", boxShadow: "0 4px 16px rgba(16,24,40,0.08)" };

function ClickableLegend({ payload, hidden, onToggle }: any) {
  return (
    <div className="chart-legend">
      {payload.map((e: any) => {
        const color = e.payload?.stroke && !String(e.payload.stroke).startsWith("url") ? e.payload.stroke : e.color;
        const dash = e.payload?.strokeDasharray;
        const off = hidden[e.dataKey];
        return (
          <span key={e.dataKey} className="cl-item" style={{ opacity: off ? 0.4 : 1 }} onClick={() => onToggle(e.dataKey)}>
            <svg width="24" height="10" aria-hidden>
              <line x1="1" y1="5" x2="23" y2="5" stroke={color} strokeWidth="2.4" strokeDasharray={dash ? "4 3" : undefined} strokeLinecap="round" />
            </svg>
            <span style={{ textDecoration: off ? "line-through" : "none" }}>{e.value}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function SellChart({
  data,
  currency = "JPY",
}: {
  data: SellMetricRow[];
  currency?: "JPY" | "USD";
}) {
  const [period, setPeriod] = useState<Period>("6M");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  const view = data.slice(-PERIODS[period]);
  const sym = currency === "JPY" ? "¥" : "$";
  const priceFmt = (v: number) => `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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
              <stop offset="0%" stopColor="#111418" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#111418" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey="trade_date" stroke={C.axis} fontSize={12} />
          <YAxis yAxisId="oh" domain={[0, 100]} stroke={C.axis} fontSize={12}
            label={{ value: "過熱度", angle: -90, position: "insideLeft", fill: C.axis, fontSize: 12 }} />
          <YAxis yAxisId="price" orientation="right" stroke={C.price} fontSize={12}
            domain={["auto", "auto"]} tickFormatter={priceFmt} width={64} />

          {bands.map((b, i) => (
            <ReferenceArea key={i} yAxisId="oh" x1={b.x1} x2={b.x2} y1={0} y2={100}
              fill={C.over} fillOpacity={0.09} ifOverflow="extendDomain" />
          ))}
          <ReferenceLine yAxisId="oh" y={SELL_THRESHOLD} stroke={C.over} strokeDasharray="5 4" strokeOpacity={0.7}
            label={{ value: `売り閾値 ${SELL_THRESHOLD}`, position: "insideTopLeft", fill: C.over, fontSize: 11 }} />

          <Tooltip contentStyle={TOOLTIP}
            formatter={(value: number, name: string) => (name === "株価" ? priceFmt(value) : value?.toFixed(1))} />
          <Legend content={(p: any) => <ClickableLegend {...p} hidden={hidden} onToggle={toggle} />} />

          <Area yAxisId="price" type="monotone" dataKey="close_price" name="株価" stroke={C.price} strokeWidth={2} fill="url(#pxFill)" dot={false} hide={!!hidden.close_price} />
          <Line yAxisId="oh" type="monotone" dataKey="overheat" name="過熱度" stroke={C.over} strokeWidth={2.6} dot={false} hide={!!hidden.overheat} />
          <Line yAxisId="oh" type="monotone" dataKey="rsi_14" name="RSI" stroke={C.rsi} strokeWidth={1} strokeDasharray="4 4" dot={false} hide={!!hidden.rsi_14} />
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 10 }}>
        左軸＝過熱度(0-100)、右軸＝株価({currency === "JPY" ? "円" : "ドル"})。
        <span style={{ color: C.over }}>赤い帯</span>は過熱度が売り閾値({SELL_THRESHOLD})以上＝「売り検討」期間。凡例クリックで線の表示/非表示。
      </p>
    </div>
  );
}
