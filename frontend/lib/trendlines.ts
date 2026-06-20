export interface TrendSegment {
  x1: string;
  y1: number;
  x2: string;
  y2: number;
  kind: "support" | "resistance";
}

/**
 * スイング高安からトレンドラインを計算する。
 * - 抵抗線: 直近2つのスイングハイを結び右端まで延長
 * - 支持線: 直近2つのスイングローを結び右端まで延長
 * ウィンドウ n はデータ長に応じて自動調整（短期=3、長期=15）。
 */
export function computeSwingTrendlines(
  data: { trade_date: string; close_price: number | null }[]
): TrendSegment[] {
  const pts = data.filter((d) => d.close_price != null && d.close_price > 0);
  const len = pts.length;
  if (len < 10) return [];

  // 左右 n 本を超える高値/安値をスイングと判定。データ長の約 6%、3〜15 本にクランプ。
  const n = Math.max(3, Math.min(15, Math.floor(len * 0.06)));
  const prices = pts.map((d) => d.close_price as number);
  const dates = pts.map((d) => d.trade_date);
  const lastIdx = len - 1;

  const highs: { idx: number; price: number }[] = [];
  const lows: { idx: number; price: number }[] = [];

  for (let i = n; i < len - n; i++) {
    const p = prices[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - n; j <= i + n; j++) {
      if (j === i) continue;
      if (prices[j] >= p) isHigh = false;
      if (prices[j] <= p) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, price: p });
    if (isLow) lows.push({ idx: i, price: p });
  }

  const segments: TrendSegment[] = [];

  const extend = (
    p1: { idx: number; price: number },
    p2: { idx: number; price: number },
    kind: "support" | "resistance"
  ) => {
    if (p2.idx <= p1.idx) return;
    const slope = (p2.price - p1.price) / (p2.idx - p1.idx);
    const y2 = p1.price + slope * (lastIdx - p1.idx);
    if (y2 <= 0) return;
    segments.push({
      x1: dates[p1.idx],
      y1: p1.price,
      x2: dates[lastIdx],
      y2: Math.round(y2 * 100) / 100,
      kind,
    });
  };

  if (highs.length >= 2) extend(highs[highs.length - 2], highs[highs.length - 1], "resistance");
  if (lows.length >= 2) extend(lows[lows.length - 2], lows[lows.length - 1], "support");

  return segments;
}
