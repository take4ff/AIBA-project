"use client";

import { useEffect, useMemo, useState } from "react";
import { UserHolding, TickerMetric } from "@/lib/user-portfolio";

type ThemeInfo = { theme: string; label: string; region: string; name?: string };
const REGION_LABEL: Record<string, string> = { jp: "日本", us: "米国", global: "グローバル" };
const PALETTE = ["#2456e6", "#2dd4bf", "#fbbf24", "#f87171", "#a78bfa", "#60a5fa", "#34d399", "#fb923c", "#94a3b8"];

export default function AllocationAnalysis({
  holdings,
  metrics,
  themeMap,
}: {
  holdings: UserHolding[];
  metrics: Map<string, TickerMetric>;
  themeMap: Map<string, ThemeInfo>;
}) {
  const [usdjpy, setUsdjpy] = useState(157);
  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((j) => { const v = j?.rates?.JPY; if (typeof v === "number" && v > 50) setUsdjpy(Math.round(v * 100) / 100); })
      .catch(() => {});
  }, []);

  const analysis = useMemo(() => {
    // 各保有の評価額（JPY換算）。株数があれば時価、無ければ null。
    const items = holdings.map((h) => {
      const close = metrics.get(h.ticker)?.close_price ?? null;
      const info = themeMap.get(h.ticker);
      const theme = info?.label ?? "未分類（ユニバース外）";
      const region = REGION_LABEL[info?.region ?? (h.currency === "JPY" ? "jp" : "us")] ?? "その他";
      let value: number | null = null;
      if (h.shares != null && close != null) {
        const jpy = h.currency === "USD" ? close * usdjpy : close;
        value = h.shares * jpy;
      }
      return { ticker: h.ticker, name: h.name ?? h.ticker, theme, region, value };
    });

    const hasAllValues = items.length > 0 && items.every((i) => i.value != null);
    const basis: "value" | "equal" = hasAllValues ? "value" : "equal";
    const weighted = items.map((i) => ({
      ...i,
      w: basis === "value" ? (i.value as number) : 1,
    }));
    const total = weighted.reduce((s, i) => s + i.w, 0) || 1;

    const agg = (keyFn: (i: (typeof weighted)[number]) => string) => {
      const m = new Map<string, number>();
      for (const i of weighted) m.set(keyFn(i), (m.get(keyFn(i)) ?? 0) + i.w / total);
      return [...m.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
    };

    const byTheme = agg((i) => i.theme);
    const byRegion = agg((i) => i.region);
    const positions = weighted.map((i) => ({ name: i.name, ticker: i.ticker, w: i.w / total })).sort((a, b) => b.w - a.w);

    const hhi = positions.reduce((s, p) => s + p.w * p.w, 0);
    const effN = hhi > 0 ? 1 / hhi : 0;
    const top = positions[0] ?? null;

    return { basis, byTheme, byRegion, positions, hhi, effN, top, n: items.length };
  }, [holdings, metrics, themeMap, usdjpy]);

  if (holdings.length === 0) return null;

  const Bars = ({ rows }: { rows: { k: string; v: number }[] }) => (
    <div className="alloc-bars">
      {rows.map((r, i) => (
        <div key={r.k} className="alloc-row">
          <span className="alloc-label" title={r.k}>{r.k}</span>
          <div className="alloc-track">
            <div className="alloc-fill" style={{ width: `${(r.v * 100).toFixed(1)}%`, background: PALETTE[i % PALETTE.length] }} />
          </div>
          <span className="alloc-pct">{(r.v * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );

  const concentration =
    analysis.effN >= analysis.n * 0.8 ? "よく分散" : analysis.effN >= 3 ? "やや集中" : "集中";

  return (
    <section className="layer" style={{ marginTop: 24 }}>
      <h2 className="layer-title">配分分析（テーマ・地域・集中度）</h2>
      <div className="alloc-grid">
        <div className="alloc-card">
          <h3 className="alloc-h">テーマ別</h3>
          <Bars rows={analysis.byTheme} />
        </div>
        <div className="alloc-card">
          <h3 className="alloc-h">地域別</h3>
          <Bars rows={analysis.byRegion} />
        </div>
      </div>

      <div className="alloc-summary">
        <span>銘柄数 <strong>{analysis.n}</strong></span>
        <span>最大比率 <strong>{analysis.top ? `${(analysis.top.w * 100).toFixed(1)}%（${analysis.top.name}）` : "—"}</strong></span>
        <span>実効銘柄数 <strong>{analysis.effN.toFixed(1)}</strong></span>
        <span>集中度 <strong style={{ color: concentration === "集中" ? "#dc2626" : concentration === "やや集中" ? "#d97706" : "#15a34a" }}>{concentration}</strong></span>
      </div>

      <p className="guide-note" style={{ marginTop: 10 }}>
        {analysis.basis === "value"
          ? `※ 株数×現在値（USDは ${usdjpy}円換算）の評価額ベース。`
          : "※ 株数が未入力の銘柄があるため均等ウェイトで集計。各銘柄に株数を入れると評価額ベースになります。"}
        　実効銘柄数＝1/ハーフィンダール指数（HHI {analysis.hhi.toFixed(2)}）。値が銘柄数に近いほど分散。
      </p>
    </section>
  );
}
