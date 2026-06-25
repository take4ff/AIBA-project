"use client";

import { useState } from "react";
import { MarketMonthlyRow } from "@/lib/data";

type Index = "sp500" | "topix";

const RET_COLORS = [
  { threshold: 8,   bg: "#14532d", fg: "#d1fae5" },
  { threshold: 5,   bg: "#166534", fg: "#dcfce7" },
  { threshold: 3,   bg: "#15803d", fg: "#f0fdf4" },
  { threshold: 1,   bg: "#4ade80", fg: "#14532d" },
  { threshold: 0,   bg: "#86efac", fg: "#166534" },
  { threshold: -1,  bg: "#fca5a5", fg: "#7f1d1d" },
  { threshold: -3,  bg: "#f87171", fg: "#450a0a" },
  { threshold: -5,  bg: "#dc2626", fg: "#fef2f2" },
  { threshold: -8,  bg: "#991b1b", fg: "#fef2f2" },
  { threshold: -Infinity, bg: "#7f1d1d", fg: "#fef2f2" },
];

function retColor(v: number | null): { bg: string; fg: string } {
  if (v == null) return { bg: "var(--surface)", fg: "var(--muted)" };
  return RET_COLORS.find((c) => v >= c.threshold) ?? RET_COLORS[RET_COLORS.length - 1];
}

function fmt(v: number | null): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function buildMatrix(rows: MarketMonthlyRow[]) {
  const sectors = [...new Set(rows.map((r) => r.sector))].sort();
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const map = new Map<string, MarketMonthlyRow>();
  for (const r of rows) map.set(`${r.sector}__${r.month}`, r);
  return { sectors, months, map };
}

export default function MarketHeatmap({
  sp500, topix,
}: {
  sp500: MarketMonthlyRow[];
  topix: MarketMonthlyRow[];
}) {
  const [index, setIndex] = useState<Index>("sp500");
  const rows = index === "sp500" ? sp500 : topix;
  const noData = rows.length === 0;

  const { sectors, months, map } = buildMatrix(rows);

  // 月ラベル: YYYY-MM-01 → MM月
  const fmtMonth = (m: string) => {
    const d = new Date(m);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // 月別セクター平均（最下行サマリー用）
  const monthAvg = months.map((m) => {
    const vals = sectors.map((s) => map.get(`${s}__${m}`)?.avg_return ?? null).filter((v) => v != null) as number[];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  return (
    <section className="layer">
      {/* インデックス切替 */}
      <div className="kind-toggle" style={{ marginBottom: 16 }}>
        {(["sp500", "topix"] as Index[]).map((k) => (
          <button key={k} className={`kt-btn${index === k ? " active" : ""}`} onClick={() => setIndex(k)}>
            {k === "sp500" ? "S&P500（米国）" : "TOPIX-17（日本）"}
          </button>
        ))}
      </div>

      {noData ? (
        <div className="notice">
          データがまだありません。<br />
          バックエンドで <code>python market_summary_job.py</code> を実行するか、毎月1日のActionsを待ってください。
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: 12, tableLayout: "auto" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--surface)", zIndex: 1, paddingRight: 16 }}>
                  セクター
                </th>
                {months.map((m) => (
                  <th key={m} style={{ textAlign: "center", minWidth: 64 }}>{fmtMonth(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectors.map((sector) => (
                <tr key={sector}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--surface)", zIndex: 1, borderRight: "1px solid var(--border)", paddingRight: 16 }}>
                    {sector}
                  </td>
                  {months.map((m) => {
                    const r = map.get(`${sector}__${m}`);
                    const v = r?.avg_return ?? null;
                    const { bg, fg } = retColor(v);
                    return (
                      <td key={m} style={{ background: bg, color: fg, textAlign: "center", fontWeight: 600, cursor: v != null ? "help" : undefined }}
                        title={v != null && r ? `${sector} ${fmtMonth(m)}\n平均: ${fmt(v)}\n中央値: ${fmt(r.median_return)}\n最高: ${r.best_ticker} ${fmt(r.best_return)}\n最低: ${r.worst_ticker} ${fmt(r.worst_return)}\n銘柄数: ${r.ticker_count}` : undefined}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* 全セクター平均行 */}
              <tr style={{ borderTop: "2px solid var(--border)" }}>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--surface)", zIndex: 1, borderRight: "1px solid var(--border)", paddingRight: 16 }}>
                  全体平均
                </td>
                {monthAvg.map((v, i) => {
                  const { bg, fg } = retColor(v);
                  return (
                    <td key={months[i]} style={{ background: bg, color: fg, textAlign: "center", fontWeight: 700 }}>
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* カラースケール凡例 */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 12, fontSize: 11, alignItems: "center" }}>
        <span style={{ color: "var(--muted)", marginRight: 4 }}>月次リターン：</span>
        {["+8%以上", "+5%〜", "+3%〜", "+1%〜", "0%〜", "-1%〜", "-3%〜", "-5%〜", "-8%以下"].map((label, i) => {
          const { bg, fg } = retColor([10, 6, 4, 2, 0.5, -1.5, -4, -6, -9][i]);
          return (
            <span key={label} style={{ background: bg, color: fg, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
              {label}
            </span>
          );
        })}
      </div>
    </section>
  );
}
