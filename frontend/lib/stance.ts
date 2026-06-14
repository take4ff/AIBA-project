import { RankingRow } from "./types";

// 買い場候補の「保有目安」（短期リバウンド / 長期成長 / 両面）を判定する。
// 既存指標のみから算出（表示用）。AIBAが買い水準でなければ null。
const BUY_LEVEL = 55;

export interface Stance {
  label: string;
  icon: string;
  cls: string;
  reason: string;
}

export function holdingStance(r: {
  aiba_score: number | null;
  layer: number;
  rsi_14: number | null;
  sentiment_score: number | null;
  sentiment_trend: number;
  divergence: boolean;
}): Stance | null {
  const aiba = r.aiba_score ?? 0;
  if (aiba < BUY_LEVEL) return null; // 買い場候補のみ

  const layer = r.layer;
  const rsi = r.rsi_14 ?? 50;
  const sent = r.sentiment_score ?? 50;
  const trend = r.sentiment_trend ?? 0;

  // 長期(成長)要因と短期(リバウンド)要因をスコア化
  const growth =
    (layer >= 2 ? 1 : 0) + (sent >= 55 ? 1 : 0) + (trend > 1 ? 1 : 0) + (r.divergence ? 1 : 0);
  const rebound =
    (rsi <= 40 ? 1 : 0) + (layer === 1 ? 1 : 0) + (trend <= 0 && sent < 55 ? 1 : 0);

  const longish = growth >= 2;
  const shortish = rebound >= 2;

  if (longish && shortish)
    return { label: "両面", icon: "⚖️", cls: "st-both", reason: "売られすぎ＋熱量上昇＝短期反発も長期成長も期待" };
  if (longish)
    return { label: "長期", icon: "🌱", cls: "st-long", reason: "第2/3層＋センチメント高/上昇＝構造的成長で長期向き" };
  if (shortish)
    return { label: "短期", icon: "⚡", cls: "st-short", reason: "売られすぎの技術的リバウンド狙い。構造的な熱量は限定的" };
  return { label: "中立", icon: "•", cls: "st-neutral", reason: "成長・リバウンドの材料が拮抗" };
}
