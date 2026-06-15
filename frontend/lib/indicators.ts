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

/** 200日移動平均の系列（不足区間は null）。長期トレンド表示用。 */
export function sma(closes: (number | null)[], period = 200): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const win = closes.slice(Math.max(0, i - period + 1), i + 1).filter((x): x is number => x != null);
    if (win.length < period) { out.push(null); continue; }
    out.push(Math.round((win.reduce((a, b) => a + b, 0) / period) * 100) / 100);
  }
  return out;
}

export interface LongTerm {
  ma200: number | null;
  dev200: number | null;     // 200日MAからの乖離 [%]
  rangePct: number | null;   // 52週レンジ内の位置 0(安値)〜100(高値)
  zone: "長期の買い場" | "やや割安" | "中立" | "やや割高" | "割高" | null;
}

/** 長期トレンド/長期押し目の判定（200日MA乖離＋52週レンジ位置）。 */
export function longTerm(closes: (number | null)[]): LongTerm {
  const vals = closes.filter((x): x is number => x != null);
  const last = vals.length ? vals[vals.length - 1] : null;
  let ma200: number | null = null;
  let dev200: number | null = null;
  if (vals.length >= 200 && last != null) {
    ma200 = vals.slice(-200).reduce((a, b) => a + b, 0) / 200;
    dev200 = (last - ma200) / ma200 * 100;
  }
  let rangePct: number | null = null;
  if (vals.length >= 120 && last != null) {        // 約半年以上あれば近似的に算出
    const win = vals.slice(-252);
    const lo = Math.min(...win), hi = Math.max(...win);
    if (hi > lo) rangePct = ((last - lo) / (hi - lo)) * 100;
  }
  let zone: LongTerm["zone"] = null;
  if (dev200 != null) {
    zone = dev200 <= -12 ? "長期の買い場"
      : dev200 <= -3 ? "やや割安"
      : dev200 <= 8 ? "中立"
      : dev200 <= 20 ? "やや割高" : "割高";
  }
  const r = (x: number | null) => x == null ? null : Math.round(x * 100) / 100;
  return { ma200: r(ma200), dev200: r(dev200), rangePct: rangePct == null ? null : Math.round(rangePct), zone };
}

export function macdLabel(s: MacdState | null): string {
  if (!s) return "—（履歴不足）";
  const tone = s.bullish ? "強気" : "弱気";
  const cross = s.cross === "golden" ? "・直近ゴールデンクロス↑"
    : s.cross === "dead" ? "・直近デッドクロス↓" : "";
  return `ヒストグラム ${s.hist >= 0 ? "+" : ""}${s.hist}（${tone}${cross}）`;
}
