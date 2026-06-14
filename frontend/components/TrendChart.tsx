"use client";

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { MetricHistoryRow } from "@/lib/types";

// AIBAスコアがこの値以上の期間を「買い場」としてハイライトする
const BUY_THRESHOLD = 60;

export type Currency = "USD" | "JPY";
const SYMBOL: Record<Currency, string> = { USD: "$", JPY: "¥" };
const makePriceFmt = (cur: Currency) => (v: number) =>
  `${SYMBOL[cur]}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** AIBAが買い閾値以上だった連続区間を [開始日, 終了日] で返す。 */
function buyBands(data: MetricHistoryRow[]): { x1: string; x2: string }[] {
  const bands: { x1: string; x2: string }[] = [];
  let start: string | null = null;
  for (let i = 0; i < data.length; i++) {
    const inZone = (data[i].aiba_score ?? -1) >= BUY_THRESHOLD;
    if (inZone && start === null) start = data[i].trade_date;
    if (!inZone && start !== null) {
      bands.push({ x1: start, x2: data[i - 1].trade_date });
      start = null;
    }
  }
  if (start !== null) bands.push({ x1: start, x2: data[data.length - 1].trade_date });
  return bands;
}

export default function TrendChart({
  data,
  currency = "USD",
}: {
  data: MetricHistoryRow[];
  currency?: Currency;
}) {
  const bands = buyBands(data);
  const priceFmt = makePriceFmt(currency);

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

          {/* 買い場ハイライト（AIBA≥閾値の期間に緑帯）*/}
          {bands.map((b, i) => (
            <ReferenceArea
              key={i}
              yAxisId="score"
              x1={b.x1}
              x2={b.x2}
              y1={0}
              y2={100}
              fill="#34d399"
              fillOpacity={0.1}
              ifOverflow="extendDomain"
            />
          ))}
          {/* 買い閾値ライン */}
          <ReferenceLine
            yAxisId="score"
            y={BUY_THRESHOLD}
            stroke="#34d399"
            strokeDasharray="5 4"
            strokeOpacity={0.7}
            label={{ value: `買い閾値 ${BUY_THRESHOLD}`, position: "insideTopLeft", fill: "#34d399", fontSize: 11 }}
          />

          <Tooltip
            contentStyle={{ background: "#121829", border: "1px solid #263049", borderRadius: 8, color: "#e6ebf5" }}
            formatter={(value: number, name: string) =>
              name === "株価" ? priceFmt(value) : value?.toFixed(1)
            }
          />
          <Legend />

          {/* 株価: 右軸・面付きで背景的に表示 */}
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
        左軸＝各種スコア(0-100)、右軸＝株価(終値・{currency === "JPY" ? "円" : "ドル"})。
        <span style={{ color: "#34d399" }}>緑の帯</span>は AIBAスコアが買い閾値({BUY_THRESHOLD})以上だった「買い場」期間。
      </p>
    </div>
  );
}
