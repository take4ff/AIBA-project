"use client";
// recharts（初回バンドルで最重量級）を含むチャート群を遅延読込にするラッパー。
// チャートは元々 ResponsiveContainer によるクライアント描画のみなので、
// ssr:false にしても表示内容は変わらず、初回JSバンドルだけが軽くなる。
// AibaIndexView / HyperscalerView はテキスト・表などSSRすべき内容を含むため対象外。
import dynamic from "next/dynamic";

const fallback = (height: number) =>
  function ChartFallback() {
    return <div className="skeleton" style={{ height, marginTop: 8 }} />;
  };

export const TrendChart = dynamic(() => import("./TrendChart"), { ssr: false, loading: fallback(360) });
export const HealthRadar = dynamic(() => import("./HealthRadar"), { ssr: false, loading: fallback(280) });
export const SellChart = dynamic(() => import("./SellChart"), { ssr: false, loading: fallback(360) });
export const PortfolioChart = dynamic(() => import("./PortfolioChart"), { ssr: false, loading: fallback(300) });
export const SnapshotChart = dynamic(() => import("./SnapshotChart"), { ssr: false, loading: fallback(300) });
export const EquityCurve = dynamic(() => import("./EquityCurve"), { ssr: false, loading: fallback(300) });
export const ICHistoryChart = dynamic(() => import("./ICHistoryChart"), { ssr: false, loading: fallback(300) });
export const EventStudyChart = dynamic(() => import("./EventStudyChart"), { ssr: false, loading: fallback(300) });
