// AIBAスコア(0-100)をヒートマップ色へ変換する。
// 高スコア=買い時=緑、低スコア=見送り=赤。
export function scoreColor(score: number | null): string {
  if (score == null) return "#445"; // データ無し
  if (score >= 70) return "#34d399"; // green
  if (score >= 58) return "#22b5a0"; // teal
  if (score >= 48) return "#5b8cff"; // blue (中立寄り)
  if (score >= 38) return "#f59e0b"; // orange
  return "#ef4444"; // red
}

export function fmt(n: number | null, digits = 1): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}
