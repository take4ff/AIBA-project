"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

// 月次リバランスの疑似エクイティカーブ（100スタート）
export interface EquityPoint {
  date: string;
  buy: number;          // 買い判定を毎月入れ替えた場合の資産
  all: number;          // 監視ユニバース等ウェイト平均
  idx?: number | null;  // インデックス放置（全世界株 ACWI）
}

const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };

export default function EquityCurve({ data }: { data: EquityPoint[] }) {
  if (data.length < 2) return null;
  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#71767f" fontSize={11} />
          <YAxis stroke="#71767f" fontSize={12} domain={["auto", "auto"]} />
          <ReferenceLine y={100} stroke="#cbd2da" />
          <Tooltip contentStyle={TOOLTIP}
            formatter={(v: number, name: string) => [v?.toFixed(1), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="buy" name="AIBA買い判定を毎月入替" stroke="#15a34a" strokeWidth={2.6} dot={false} />
          <Line type="monotone" dataKey="all" name="監視ユニバース等ウェイト平均" stroke="#94a3b8" strokeWidth={1.6} dot={false} />
          <Line type="monotone" dataKey="idx" name="インデックス放置(全世界株ACWI)" stroke="#2456e6" strokeWidth={1.8} strokeDasharray="5 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        100スタート。緑＝各記録日に「買い判定の銘柄」を買い約1ヶ月保有→翌記録日に入替（買い無しの月は現金）。
        灰＝<strong>監視ユニバース（全テーマのETF＋個別株）の等ウェイト平均</strong>。青破線＝<strong>全世界株(ACWI)を放置</strong>。
        重複・取引コスト未考慮の概算。
      </p>
    </div>
  );
}
