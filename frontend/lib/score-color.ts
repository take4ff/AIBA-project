// AIBAスコア(0-100)をヒートマップ色へ変換する。
// 高スコア=買い時=緑、低スコア=見送り=赤。
export function scoreColor(score: number | null): string {
  if (score == null) return "#9aa0aa"; // データ無し
  if (score >= 70) return "#15a34a"; // green
  if (score >= 58) return "#0d9488"; // teal
  if (score >= 48) return "#2456e6"; // blue (中立寄り)
  if (score >= 38) return "#d97706"; // amber
  return "#dc2626"; // red
}

export function fmt(n: number | null, digits = 1): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}
