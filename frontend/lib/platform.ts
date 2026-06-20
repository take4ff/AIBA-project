// 「未来のGAFAM」候補スコア：成長×研究熱量×テーマ展開幅×事業の頑丈さ×規模の伸びしろ。
// あくまで投機的なヒューリスティック（将来を保証しない）。

import { RankingRow } from "./types";
import { FullFundamentals } from "./data";
import { qualityScore } from "./fundamentals";

const clamp = (x: number) => Math.max(0, Math.min(100, x));

export interface PlatformParts { name: string; pts: number; note: string }
export interface PlatformResult { score: number; parts: PlatformParts[]; breadth: number }

/**
 * 重み：成長0.25 / 展開幅0.20 / 伸びしろ0.20 / 熱量0.20 / 頑丈さ0.15。
 * 規模の伸びしろ＝時価総額が小さいほど高い（既に巨大なGAFAMは低く＝“未来の”候補を拾う）。
 */
export function platformScore(row: RankingRow, f: FullFundamentals | undefined): PlatformResult {
  const parts: PlatformParts[] = [];

  // 成長：売上成長を主、EPS成長を従
  const rg = f?.revenue_growth, eg = f?.eps_growth;
  const growthPct = rg != null ? rg * 100 : eg != null ? eg * 100 : null;
  const growth = growthPct == null ? 50 : clamp(40 + growthPct * 1.4);
  parts.push({ name: "成長", pts: growth, note: growthPct == null ? "—" : `売上 ${growthPct.toFixed(0)}%` });

  // 研究熱量：テーマのセンチメント
  const heat = row.sentiment_score ?? 50;
  parts.push({ name: "研究熱量", pts: clamp(heat), note: `${Math.round(heat)}` });

  // テーマ展開幅：主＋副テーマ数（optionality）
  const breadth = 1 + (row.tags?.length ?? 0);
  const breadthPts = clamp(20 + breadth * 20);
  parts.push({ name: "展開幅", pts: breadthPts, note: `${breadth}テーマ` });

  // 事業の頑丈さ：品質スコア
  const q = f ? qualityScore(f as any) : null;
  const quality = q?.score ?? 50;
  parts.push({ name: "頑丈さ", pts: quality, note: q?.score != null ? `${q.score}` : "—" });

  // 規模の伸びしろ：時価総額が小さいほど高い（対数）。$5B以下=満点、$2T以上=低い。
  const mc = f?.market_cap ?? null;
  let headroom = 50;
  if (mc != null && mc > 0) {
    const t = Math.log10(mc);              // 9=¥10億ドル, 12=¥1兆ドル
    headroom = clamp(100 - (t - 9.7) * 38); // ~$5B→100, ~$1T→~22
  }
  parts.push({ name: "伸びしろ", pts: headroom, note: mc == null ? "—" : fmtCap(mc) });

  const W = { 成長: 0.25, 展開幅: 0.2, 伸びしろ: 0.2, 研究熱量: 0.2, 頑丈さ: 0.15 } as Record<string, number>;
  const score = Math.round(parts.reduce((a, p) => a + p.pts * (W[p.name] ?? 0), 0));
  return { score, parts, breadth };
}

export function fmtCap(mc: number): string {
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(0)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
  return `$${mc}`;
}
