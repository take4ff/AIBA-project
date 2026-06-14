// 銘柄の要点を1〜2文に自動要約（ルールベース・投資助言ではない）。

export interface NarrativeInput {
  name: string;
  aiba: number | null;
  fairDiscount: number | null;   // 相対PERの割安%（+割安 / −割高）。上限済みでも可
  epsGrowth: number | null;      // 比率（0.1 = +10%）
  sentiment: number | null;      // 0-100
  buyzoneProb: number | null;    // 0-1
  nextEarnings: string | null;   // 'YYYY-MM-DD'
}

export function narrative(p: NarrativeInput): string {
  const parts: string[] = [];

  if (p.aiba != null) {
    const t = p.aiba >= 60 ? "買い場圏" : p.aiba >= 48 ? "中立" : "慎重";
    parts.push(`AIBA ${p.aiba.toFixed(0)}（${t}）`);
  }
  if (p.fairDiscount != null) {
    if (p.fairDiscount >= 10) parts.push("業界比で割安");
    else if (p.fairDiscount <= -10) parts.push("業界比で割高");
    else parts.push("業界並みの評価");
  }
  if (p.epsGrowth != null) parts.push(p.epsGrowth < 0 ? "足元は減益" : "増益基調");
  if (p.sentiment != null) {
    parts.push(p.sentiment >= 58 ? "研究熱量は高い" : p.sentiment < 45 ? "熱量は低調" : "熱量は中庸");
  }

  let s = `${p.name}は、` + (parts.length ? parts.join("・") + "。" : "");

  const tail: string[] = [];
  if (p.buyzoneProb != null) tail.push(`1ヶ月の買い場入り確率は約${Math.round(p.buyzoneProb * 100)}%`);
  if (p.nextEarnings) {
    const d = Math.ceil((new Date(p.nextEarnings + "T00:00:00").getTime() - Date.now()) / 86_400_000);
    if (d >= 0 && d <= 14) tail.push(`決算が${d}日後で変動に注意`);
  }
  if (tail.length) s += tail.join("、") + "。";
  return s;
}
