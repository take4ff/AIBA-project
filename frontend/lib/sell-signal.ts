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

// 次回決算までの日数（過去/不明は null）
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  return diff;
}

// 次回決算の表示テキスト＋接近フラグ（7日以内）
export function earningsLabel(dateStr: string | null): { text: string; soon: boolean } {
  const days = daysUntil(dateStr);
  if (dateStr == null || days == null) return { text: "—", soon: false };
  if (days < 0) return { text: dateStr, soon: false };
  return { text: `${dateStr}（あと${days}日）`, soon: days <= 7 };
}

const clamp = (x: number) => Math.max(0, Math.min(100, x));

// ファンダによる過熱度の上乗せ（割高・減益ほど売り圧）。最大+20。
function fundamentalAdj(p: {
  forward_pe?: number | null; trailing_pe?: number | null; eps_growth?: number | null;
}): { adj: number; reasons: string[] } {
  const reasons: string[] = [];
  let adj = 0;
  const pe = p.forward_pe && p.forward_pe > 0 ? p.forward_pe
    : p.trailing_pe && p.trailing_pe > 0 ? p.trailing_pe : null;
  if (pe != null) {
    if (pe >= 50) { adj += 12; reasons.push(`PER ${pe.toFixed(0)}＝かなり割高`); }
    else if (pe >= 35) { adj += 8; reasons.push(`PER ${pe.toFixed(0)}＝割高`); }
    else if (pe >= 25) { adj += 4; reasons.push(`PER ${pe.toFixed(0)}＝やや割高`); }
  }
  if (p.eps_growth != null && p.eps_growth < 0) {
    adj += 6; reasons.push(`減益(EPS ${(p.eps_growth * 100).toFixed(0)}%)`);
  }
  return { adj: Math.min(adj, 20), reasons };
}

export interface SellAssessment {
  effective: number | null; // テクニカル過熱＋ファンダ調整(0-100)
  fundAdj: number;
  reasons: string[];
  earningsDays: number | null;
  earningsSoon: boolean;
  badge: { label: string; cls: string };
  tooltip: string;
}

// 損切りライン：取得単価からの下落率がしきい値以上で「損切り検討」。
// 過熱度ベースの売りシグナルは高値圏を捉えるため、株価下落（塩漬け）を取りこぼす。
// その穴を埋める、含み損ベースの独立した売り基準。
export interface StopLossAssessment {
  triggered: boolean;
  lossPct: number | null;   // 含み損益[%]（マイナス=損失）
  label: string;
  tooltip: string;
}

export function assessStopLoss(ret: number | null, thresholdPct: number): StopLossAssessment {
  if (ret == null || !(thresholdPct > 0)) {
    return { triggered: false, lossPct: ret, label: "", tooltip: "" };
  }
  const triggered = ret <= -thresholdPct;
  return {
    triggered,
    lossPct: ret,
    label: triggered ? `🔻 損切り検討 ${ret.toFixed(0)}%` : "",
    tooltip: triggered
      ? `取得単価から ${Math.abs(ret).toFixed(1)}% 下落（損切りライン −${thresholdPct}%）。`
        + `過熱度ベースの売りシグナルは下落局面を捉えないため、塩漬け回避の独立基準。`
        + `長期保有方針（テーマの構造的成長を取りに行く）なら無視可。`
      : "",
  };
}

// 売りシグナルの総合評価（過熱度＋ファンダ＋決算接近）。
export function assessSell(p: {
  overheat: number | null;
  forward_pe?: number | null; trailing_pe?: number | null; eps_growth?: number | null;
  next_earnings_date?: string | null;
}): SellAssessment {
  const { adj, reasons } = fundamentalAdj(p);
  const effective = p.overheat == null ? null : clamp(p.overheat + adj);
  const days = daysUntil(p.next_earnings_date ?? null);
  const soon = days != null && days >= 0 && days <= 7;

  let badge: { label: string; cls: string };
  if (soon) badge = { label: `🟣 決算前（あと${days}日）`, cls: "sb-event" };
  else badge = sellBadge(effective);

  const parts: string[] = [];
  if (p.overheat != null) parts.push(`テクニカル過熱 ${Math.round(p.overheat)}`);
  if (adj > 0) parts.push(`ファンダ +${adj}（${reasons.join("・")}）`);
  if (effective != null && adj > 0) parts.push(`→ 総合 ${Math.round(effective)}`);
  if (soon) parts.push("決算前のためイベントリスクに注意（様子見推奨）");
  return { effective, fundAdj: adj, reasons, earningsDays: days, earningsSoon: soon, badge, tooltip: parts.join(" / ") };
}
