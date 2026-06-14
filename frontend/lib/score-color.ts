// AIBAスコア(0-100)をヒートマップ色へ変換する。
// 高スコア=買い時=緑、低スコア=見送り=赤。
// 表（ネイビー背景）上で映える明るめのヒートマップ色。
export function scoreColor(score: number | null): string {
  if (score == null) return "#7e8aa6"; // データ無し
  if (score >= 70) return "#34d399"; // green
  if (score >= 58) return "#2dd4bf"; // teal
  if (score >= 48) return "#60a5fa"; // blue (中立寄り)
  if (score >= 38) return "#fbbf24"; // amber
  return "#f87171"; // red
}

export function fmt(n: number | null, digits = 1): string {
  if (n == null) return "—";
  return n.toFixed(digits);
}
