"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { UserHolding } from "@/lib/user-portfolio";

type HistMap = Map<string, { date: string; close: number }[]>;
type AcwiPoint = { date: string; close: number };

const PERIODS = [
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
] as const;

const C = {
  portfolio: "#6366f1",
  acwi: "#9aa0aa",
  grid: "#e6e8ec",
  axis: "#71767f",
};
const TOOLTIP_STYLE = {
  background: "#fff", border: "1px solid #e6e8ec",
  borderRadius: 8, color: "#16191f", boxShadow: "0 4px 16px rgba(16,24,40,0.08)",
};

export default function PortfolioChart({
  holdings, histories, acwi,
}: {
  holdings: UserHolding[];
  histories: HistMap;
  acwi: AcwiPoint[];
}) {
  const [period, setPeriod] = useState<typeof PERIODS[number]["label"]>("1Y");
  const days = PERIODS.find((p) => p.label === period)!.days;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const chartData = useMemo(() => {
    const validTickers = holdings
      .filter((h) => !h.is_fund)
      .map((h) => h.ticker)
      .filter((t) => (histories.get(t)?.length ?? 0) > 0);
    if (!validTickers.length) return [];

    // 各ティッカーの日付→終値マップ（全期間）
    const priceMap = new Map<string, Map<string, number>>();
    for (const t of validTickers) {
      const m = new Map<string, number>();
      for (const r of histories.get(t) ?? []) m.set(r.date, r.close);
      priceMap.set(t, m);
    }

    // 日付はユニオン（米国・日本の休日差を吸収）
    const allDates = [...new Set(
      validTickers.flatMap((t) =>
        (histories.get(t) ?? []).filter((r) => r.date >= cutoff).map((r) => r.date)
      )
    )].sort();
    if (allDates.length < 2) return [];

    const t0 = allDates[0];
    // 基準値: period 開始日以前で最後の既知終値
    const base = new Map<string, number>();
    for (const t of validTickers) {
      const sorted = (histories.get(t) ?? []).filter((r) => r.date <= t0).sort((a, b) => (a.date < b.date ? 1 : -1));
      if (sorted[0]) base.set(t, sorted[0].close);
    }

    // ACWI
    const acwiFiltered = acwi.filter((r) => r.date >= cutoff);
    const acwiBase = acwiFiltered.find((r) => r.date >= t0)?.close ?? null;
    const acwiByDate = new Map(acwiFiltered.map((r) => [r.date, r.close]));

    // forward-fill: 当日データがない場合は前日値を使用
    const lastPrice = new Map<string, number>(base);
    return allDates.map((date) => {
      const returns: number[] = [];
      for (const t of validTickers) {
        const b = base.get(t);
        if (!b) continue;
        const p = priceMap.get(t)?.get(date);
        if (p != null) lastPrice.set(t, p);
        returns.push(((lastPrice.get(t) ?? b) / b) * 100);
      }
      if (!returns.length) return null;
      const portfolio = returns.reduce((s, v) => s + v, 0) / returns.length;
      const acwiClose = acwiByDate.get(date) ?? null;
      const acwiIdx = acwiBase && acwiClose ? (acwiClose / acwiBase) * 100 : null;
      return { date, portfolio: Math.round(portfolio * 10) / 10, acwi: acwiIdx ? Math.round(acwiIdx * 10) / 10 : null };
    }).filter(Boolean) as { date: string; portfolio: number; acwi: number | null }[];
  }, [holdings, histories, acwi, cutoff]);

  if (chartData.length < 2) return null;

  const first = chartData[0].portfolio;
  const last = chartData[chartData.length - 1].portfolio;
  const ret = ((last - first) / first) * 100;
  const acwiFirst = chartData.find((d) => d.acwi != null)?.acwi ?? 100;
  const acwiLast = [...chartData].reverse().find((d) => d.acwi != null)?.acwi ?? 100;
  const acwiRet = ((acwiLast - acwiFirst) / acwiFirst) * 100;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>ポートフォリオ推移（等ウェイト）</h2>
        <span style={{ fontSize: 13, color: ret >= 0 ? "#15a34a" : "#dc2626", fontWeight: 700 }}>
          {ret >= 0 ? "+" : ""}{ret.toFixed(1)}%
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          vs ACWI {acwiRet >= 0 ? "+" : ""}{acwiRet.toFixed(1)}%
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {PERIODS.map((p) => (
            <button key={p.label} type="button"
              className={period === p.label ? "kind-active" : "kind-btn"}
              onClick={() => setPeriod(p.label)}
              style={{ padding: "3px 10px", fontSize: 12 }}
            >{p.label}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.axis }}
            tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: C.axis }} width={42}
            tickFormatter={(v: number) => `${v}`} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [`${v}`, name === "portfolio" ? "ポートフォリオ" : "ACWI"]}
            labelFormatter={(l: string) => l}
          />
          <Legend formatter={(v) => v === "portfolio" ? "ポートフォリオ" : "ACWI"} />
          <Line type="monotone" dataKey="portfolio" stroke={C.portfolio} dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="acwi" stroke={C.acwi} dot={false} strokeWidth={1.5} strokeDasharray="4 3" connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        ※ 株/ETFのみ対象（投信除く）。各銘柄を等ウェイトで指数化（開始=100）。取引コスト未考慮。
      </p>
    </div>
  );
}
