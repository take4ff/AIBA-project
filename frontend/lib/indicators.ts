// 補助テクニカル指標（クライアント計算）。スコアには影響させず表示のみに使う。

function ema(vals: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev: number | undefined;
  for (const v of vals) {
    prev = prev === undefined ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** ボリンジャーバンド（period=20, ±k*σ）。先頭の不足区間は null。 */
export function bollinger(
  closes: (number | null)[],
  period = 20,
  k = 2,
): { upper: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const win = closes.slice(Math.max(0, i - period + 1), i + 1).filter((x): x is number => x != null);
    if (i < period - 1 || win.length < period) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const m = win.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    upper.push(Math.round((m + k * sd) * 100) / 100);
    lower.push(Math.round((m - k * sd) * 100) / 100);
  }
  return { upper, lower };
}

export interface MacdState {
  hist: number;          // 直近ヒストグラム（MACD - シグナル）
  bullish: boolean;      // hist > 0
  cross: "golden" | "dead" | null; // 直近のクロス
}

/** MACD(12,26,9) の最新状態。データ不足時は null。 */
export function macdState(closes: (number | null)[]): MacdState | null {
  const c = closes.filter((x): x is number => x != null);
  if (c.length < 35) return null;
  const e12 = ema(c, 12);
  const e26 = ema(c, 26);
  const macdLine = c.map((_, i) => e12[i] - e26[i]);
  const signal = ema(macdLine, 9);
  const hist = macdLine.map((v, i) => v - signal[i]);
  const n = hist.length;
  const last = hist[n - 1];
  const prev = hist[n - 2];
  let cross: "golden" | "dead" | null = null;
  if (prev <= 0 && last > 0) cross = "golden";
  else if (prev >= 0 && last < 0) cross = "dead";
  return { hist: Math.round(last * 100) / 100, bullish: last > 0, cross };
}

export interface BuyGuide {
  current: number | null;
  fair: number | null;      // 妥当値 = 25日移動平均
  pullback: number | null;  // 押し目買い目安 = MA − 1σ
  support: number | null;   // 下値支持 = 直近60日安値
}

/** 株価の購入目安（妥当値・押し目・下値）を算出。 */
export function buyGuide(closes: (number | null)[], maPeriod = 25): BuyGuide {
  const vals = closes.filter((x): x is number => x != null);
  const current = vals.length ? vals[vals.length - 1] : null;
  if (vals.length < maPeriod) return { current, fair: null, pullback: null, support: null };
  const recent = vals.slice(-maPeriod);
  const ma = recent.reduce((a, b) => a + b, 0) / maPeriod;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - ma) ** 2, 0) / maPeriod);
  const support = Math.min(...vals.slice(-60));
  const r = (x: number) => Math.round(x * 100) / 100;
  return { current, fair: r(ma), pullback: r(ma - sd), support: r(support) };
}

export function macdLabel(s: MacdState | null): string {
  if (!s) return "—（履歴不足）";
  const tone = s.bullish ? "強気" : "弱気";
  const cross = s.cross === "golden" ? "・直近ゴールデンクロス↑"
    : s.cross === "dead" ? "・直近デッドクロス↓" : "";
  return `ヒストグラム ${s.hist >= 0 ? "+" : ""}${s.hist}（${tone}${cross}）`;
}
