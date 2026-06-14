import { scoreColor } from "./score-color";

// 過熱度(高いほど売り時)を色へ。低い=保有継続(緑)、高い=売り(赤)。
export function overheatColor(overheat: number | null): string {
  if (overheat == null) return "#445";
  return scoreColor(100 - overheat); // 割安色の反転
}

export function sellBadge(overheat: number | null): { label: string; cls: string } {
  if (overheat == null) return { label: "指標待ち", cls: "sb-none" };
  if (overheat >= 70) return { label: "🔴 売り検討", cls: "sb-sell" };
  if (overheat >= 55) return { label: "🟡 注意", cls: "sb-watch" };
  return { label: "🟢 継続", cls: "sb-hold" };
}

export function money(v: number | null, currency: "JPY" | "USD"): string {
  if (v == null) return "—";
  const sym = currency === "JPY" ? "¥" : "$";
  return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: currency === "JPY" ? 0 : 2 })}`;
}

export function pct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
