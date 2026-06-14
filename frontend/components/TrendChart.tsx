"use client";

import { useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { MetricHistoryRow } from "@/lib/types";
import PeriodFilter, { PERIODS, Period } from "@/components/PeriodFilter";

const BUY_THRESHOLD = 60;

export type Currency = "USD" | "JPY";
const SYMBOL: Record<Currency, string> = { USD: "$", JPY: "¥" };
const makePriceFmt = (cur: Currency) => (v: number) =>
  `${SYMBOL[cur]}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const C = { grid: "#e6e8ec", axis: "#71767f", price: "#374151", aiba: "#15a34a", tech: "#2456e6", sent: "#d97706", rsi: "#9aa0aa", buy: "#15a34a" };
const TOOLTIP = { background: "#ffffff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f", boxShadow: "0 4px 16px rgba(16,24,40,0.08)" };

function buyBands(data: MetricHistoryRow[]): { x1: string; x2: string }[] {
  const bands: { x1: string; x2: string }[] = [];
  let start: string | null = null;
  for (let i = 0; i < data.length; i++) {
    const inZone = (data[i].aiba_score ?? -1) >= BUY_THRESHOLD;
    if (inZone && start === null) start = data[i].trade_date;
    if (!inZone && start !== null) { bands.push({ x1: start, x2: data[i - 1].trade_date }); start = null; }
  }
  if (start !== null) bands.push({ x1: start, x2: data[data.length - 1].trade_date });
  return bands;
}

// 点線/実線を見分けられ、クリックで表示切替できる凡例
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

export default function TrendChart({
  data,
  currency = "USD",
  etfCompare = false,
  buyLevel = null,
}: {
  data: MetricHistoryRow[];
  currency?: Currency;
  etfCompare?: boolean;
  buyLevel?: number | null;
}) {
  const [period, setPeriod] = useState<Period>("6M");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  const view = data.slice(-PERIODS[period]);
  const bands = buyBands(view);
  const priceFmt = makePriceFmt(currency);

  return (
    <div className="chart-wrap">
      <PeriodFilter value={period} onChange={setPeriod} />
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={view} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#111418" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#111418" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey="trade_date" stroke={C.axis} fontSize={12} />
          <YAxis yAxisId="score" domain={[0, 100]} stroke={C.axis} fontSize={12}
            label={{ value: "スコア", angle: -90, position: "insideLeft", fill: C.axis, fontSize: 12 }} />
          <YAxis yAxisId="price" orientation="right" stroke={C.price} fontSize={12}
            domain={["auto", "auto"]} tickFormatter={priceFmt} width={64} />

          {bands.map((b, i) => (
            <ReferenceArea key={i} yAxisId="score" x1={b.x1} x2={b.x2} y1={0} y2={100}
              fill={C.buy} fillOpacity={0.09} ifOverflow="extendDomain" />
          ))}
          <ReferenceLine yAxisId="score" y={BUY_THRESHOLD} stroke={C.buy} strokeDasharray="5 4" strokeOpacity={0.7}
            label={{ value: `買い閾値 ${BUY_THRESHOLD}`, position: "insideTopLeft", fill: C.buy, fontSize: 11 }} />

          {buyLevel != null && (
            <ReferenceLine yAxisId="price" y={buyLevel} stroke="#111418" strokeDasharray="6 3" strokeOpacity={0.85}
              label={{ value: `押し目目安 ${priceFmt(buyLevel)}`, position: "insideBottomRight", fill: "#111418", fontSize: 11 }} />
          )}

          <Tooltip contentStyle={TOOLTIP}
            formatter={(value: number, name: string) => (name === "株価" ? priceFmt(value) : value?.toFixed(1))} />
          <Legend content={(p: any) => <ClickableLegend {...p} hidden={hidden} onToggle={toggle} />} />

          <Line yAxisId="price" type="monotone" dataKey="bb_upper" name="BB上限" stroke={C.tech} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.5} dot={false} connectNulls hide={!!hidden.bb_upper} />
          <Line yAxisId="price" type="monotone" dataKey="bb_lower" name="BB下限" stroke={C.tech} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.5} dot={false} connectNulls hide={!!hidden.bb_lower} />

          <Area yAxisId="price" type="monotone" dataKey="close_price" name="株価" stroke={C.price} strokeWidth={2} fill="url(#priceFill)" dot={false} hide={!!hidden.close_price} />

          <Line yAxisId="score" type="monotone" dataKey="aiba_score" name="AIBA" stroke={C.aiba} strokeWidth={2.8} dot={false} hide={!!hidden.aiba_score} />
          {etfCompare && (
            <Line yAxisId="score" type="monotone" dataKey="etf_aiba" name="業界AIBA" stroke={C.aiba} strokeWidth={1.4} strokeDasharray="5 3" strokeOpacity={0.6} dot={false} connectNulls hide={!!hidden.etf_aiba} />
          )}
          <Line yAxisId="score" type="monotone" dataKey="technical_score" name="テクニカル" stroke={C.tech} strokeWidth={1.4} dot={false} hide={!!hidden.technical_score} />
          <Line yAxisId="score" type="monotone" dataKey="sentiment_score" name="センチメント" stroke={C.sent} strokeWidth={1.4} dot={false} hide={!!hidden.sentiment_score} />
          <Line yAxisId="score" type="monotone" dataKey="rsi_14" name="RSI" stroke={C.rsi} strokeWidth={1} strokeDasharray="4 4" dot={false} hide={!!hidden.rsi_14} />
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 10 }}>
        左軸＝各種スコア(0-100)、右軸＝株価(終値・{currency === "JPY" ? "円" : "ドル"})。
        <span style={{ color: C.buy }}>緑の帯</span>は AIBAスコアが買い閾値({BUY_THRESHOLD})以上だった「買い場」期間。凡例クリックで線の表示/非表示。
      </p>
    </div>
  );
}
