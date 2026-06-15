"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import ClickableLegend from "@/components/ClickableLegend";

// 月次リバランスの疑似エクイティカーブ（100スタート）
export interface EquityPoint {
  date: string;
  buy50?: number;       // AIBA≥50
  buy: number;          // AIBA≥60（標準の買い判定）
  buy70?: number;       // AIBA≥70（厳格）
  all: number;          // 監視ユニバース等ウェイト平均
  idx?: number | null;  // インデックス放置（全世界株 ACWI）
}

const TOOLTIP = { background: "#fff", border: "1px solid #e6e8ec", borderRadius: 8, color: "#16191f" };

const LINES: { key: keyof EquityPoint; name: string; color: string; width: number; dash?: string }[] = [
  { key: "buy50", name: "AIBA買い ≥50", color: "#6ee7b7", width: 1.8 },
  { key: "buy", name: "AIBA買い ≥60", color: "#15a34a", width: 2.6 },
  { key: "buy70", name: "AIBA厳格 ≥70", color: "#ea580c", width: 2.0 },
  { key: "all", name: "監視ユニバース等ウェイト", color: "#94a3b8", width: 1.6 },
  { key: "idx", name: "全世界株ACWI放置", color: "#2456e6", width: 1.8, dash: "5 3" },
];

export default function EquityCurve({ data }: { data: EquityPoint[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  if (data.length < 2) return null;

  return (
    <div className="chart-wrap" style={{ paddingTop: 8 }}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#71767f" fontSize={11} />
          <YAxis stroke="#71767f" fontSize={12} domain={["auto", "auto"]} />
          <ReferenceLine y={100} stroke="#cbd2da" />
          <Tooltip contentStyle={TOOLTIP} formatter={(v: number, name: string) => [v?.toFixed(1), name]} />
          <Legend content={(p: any) => <ClickableLegend {...p} hidden={hidden} onToggle={toggle} />} />
          {LINES.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color}
              strokeWidth={l.width} strokeDasharray={l.dash} dot={false} connectNulls hide={!!hidden[l.key]} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p style={{ color: "#71767f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
        100スタート。AIBA買い（≥50/≥60/≥70）を毎月入替（該当無しの月は現金）、灰＝監視ユニバース等ウェイト、青破線＝全世界株ACWI放置。
        <strong>凡例クリックで表示/非表示</strong>。重複・取引コスト未考慮の概算。
      </p>
    </div>
  );
}
