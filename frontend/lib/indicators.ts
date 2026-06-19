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

export interface Downside {
  current: number | null;
  floorStrong: number | null;  // 強い下値メド = 52週安値（1年で最も売られた水準）
  floorNear: number | null;    // 近い下値メド = max(直近60日安値, −2σ)
  downsidePct: number | null;  // 現在値→強い下値メドまでの下落余地[%]（負）
  volAnnual: number | null;    // 年率ボラティリティ[%]
  maxDrawdown: number | null;  // 直近1年の最大ドローダウン[%]（負）
  stability: "高い" | "中程度" | "低い" | null;  // 値動きの安定度（下方耐性の目安）
}

/**
 * 下方リスク・プロファイル：複数の支持線で「これ以上下がりにくい目安」を束ね、
 * ボラティリティと最大下落率で値動きの安定度（下方耐性）を評価する。
 * いずれもテクニカルな目安で、割れる/さらに下落する可能性は残る（絶対ではない）。
 */
export function downsideProfile(closes: (number | null)[]): Downside {
  const vals = closes.filter((x): x is number => x != null);
  const current = vals.length ? vals[vals.length - 1] : null;
  const empty: Downside = { current, floorStrong: null, floorNear: null, downsidePct: null, volAnnual: null, maxDrawdown: null, stability: null };
  if (vals.length < 60 || current == null) return empty;
  const r = (x: number) => Math.round(x * 100) / 100;

  const win52 = vals.slice(-252);
  const floorStrong = Math.min(...win52);
  // 近い支持：直近60日安値と、25日ボリンジャー −2σ の高い方
  const recent = vals.slice(-25);
  const ma = recent.reduce((a, b) => a + b, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - ma) ** 2, 0) / recent.length);
  const low60 = Math.min(...vals.slice(-60));
  const floorNear = Math.max(low60, ma - 2 * sd);
  const downsidePct = ((floorStrong - current) / current) * 100;

  // 年率ボラティリティ（日次対数リターンの標準偏差 × √252）
  const rets: number[] = [];
  for (let i = 1; i < win52.length; i++) {
    if (win52[i - 1] > 0) rets.push(Math.log(win52[i] / win52[i - 1]));
  }
  let volAnnual: number | null = null;
  if (rets.length > 20) {
    const mr = rets.reduce((a, b) => a + b, 0) / rets.length;
    const v = Math.sqrt(rets.reduce((a, b) => a + (b - mr) ** 2, 0) / rets.length);
    volAnnual = v * Math.sqrt(252) * 100;
  }
  // 直近1年の最大ドローダウン
  let peak = win52[0], maxDD = 0;
  for (const p of win52) { if (p > peak) peak = p; const dd = (p - peak) / peak; if (dd < maxDD) maxDD = dd; }
  const maxDrawdown = maxDD * 100;

  // 安定度：低ボラ＆浅いDD ほど「下方耐性が高い」目安
  let stability: Downside["stability"] = null;
  if (volAnnual != null) {
    if (volAnnual < 35 && maxDrawdown > -35) stability = "高い";
    else if (volAnnual < 60 && maxDrawdown > -55) stability = "中程度";
    else stability = "低い";
  }
  return {
    current, floorStrong: r(floorStrong), floorNear: r(floorNear),
    downsidePct: Math.round(downsidePct), volAnnual: volAnnual == null ? null : Math.round(volAnnual),
    maxDrawdown: Math.round(maxDrawdown), stability,
  };
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

// ----------------------------- 一目均衡表 -----------------------------
export interface Ichimoku {
  tenkan: number | null;   // 転換線(9)
  kijun: number | null;    // 基準線(26)
  spanA: number | null;    // 先行スパンA
  spanB: number | null;    // 先行スパンB(52)
  cloud: "雲の上" | "雲の中" | "雲の下" | null;
  tk: "好転" | "逆転" | "中立" | null;  // 転換線 vs 基準線
  verdict: "買い" | "売り" | "中立" | null;
}

/** 一目均衡表（終値ベースの近似。高値/安値を持たないため close を代用）。 */
export function ichimoku(closes: (number | null)[]): Ichimoku {
  const v = closes.filter((x): x is number => x != null);
  const empty: Ichimoku = { tenkan: null, kijun: null, spanA: null, spanB: null, cloud: null, tk: null, verdict: null };
  if (v.length < 52) return empty;
  const mid = (n: number) => { const w = v.slice(-n); return (Math.max(...w) + Math.min(...w)) / 2; };
  const tenkan = mid(9), kijun = mid(26);
  const spanA = (tenkan + kijun) / 2, spanB = mid(52);
  const price = v[v.length - 1];
  const top = Math.max(spanA, spanB), bot = Math.min(spanA, spanB);
  const cloud = price > top ? "雲の上" : price < bot ? "雲の下" : "雲の中";
  const tk = tenkan > kijun ? "好転" : tenkan < kijun ? "逆転" : "中立";
  const verdict = cloud === "雲の上" && tk === "好転" ? "買い"
    : cloud === "雲の下" && tk === "逆転" ? "売り" : "中立";
  const r = (x: number) => Math.round(x * 100) / 100;
  return { tenkan: r(tenkan), kijun: r(kijun), spanA: r(spanA), spanB: r(spanB), cloud, tk, verdict };
}

// ----------------------------- テクニカル総合判定 -----------------------------
export type Verdict = "買い" | "売り" | "中立";
export interface TechSignal { name: string; verdict: Verdict; detail: string; group: "トレンド" | "オシレーター"; }
export interface TechSummary {
  signals: TechSignal[];
  buy: number; sell: number; neutral: number;
  overall: "買い寄り" | "やや買い" | "中立" | "やや売り" | "売り寄り";
}

/**
 * 移動平均(25/200)・MACD・一目均衡表（トレンド系）＋ RSI・ボリンジャー（オシレーター系）を
 * それぞれ 買い/売り/中立 に評価し、総合の傾きを返す。買い場/売り場の目安を一覧で網羅する。
 */
export function technicalSummary(closes: (number | null)[], rsi: number | null): TechSummary {
  const v = closes.filter((x): x is number => x != null);
  const price = v.length ? v[v.length - 1] : null;
  const signals: TechSignal[] = [];
  const push = (name: string, verdict: Verdict, detail: string, group: TechSignal["group"]) =>
    signals.push({ name, verdict, detail, group });

  // トレンド系
  const g = buyGuide(closes);
  if (price != null && g.fair != null) {
    push("移動平均(25日)", price >= g.fair ? "買い" : "売り",
      price >= g.fair ? "株価が25日線の上＝短期上昇基調" : "株価が25日線の下＝短期下降基調", "トレンド");
  }
  const lt = longTerm(closes);
  if (lt.dev200 != null) {
    push("移動平均(200日)", lt.dev200 >= 0 ? "買い" : "売り",
      `200日線乖離 ${lt.dev200 >= 0 ? "+" : ""}${lt.dev200}%＝長期${lt.dev200 >= 0 ? "上昇" : "下降"}基調`, "トレンド");
  }
  const macd = macdState(closes);
  if (macd) push("MACD", macd.bullish ? "買い" : "売り",
    macdLabel(macd), "トレンド");
  const ich = ichimoku(closes);
  if (ich.verdict) push("一目均衡表", ich.verdict,
    `${ich.cloud}・転換/基準=${ich.tk}`, "トレンド");

  // オシレーター系（売られすぎ＝押し目＝買い、買われすぎ＝売り）
  if (rsi != null) {
    const v2: Verdict = rsi < 30 ? "買い" : rsi > 70 ? "売り" : "中立";
    push("RSI(14)", v2, `RSI ${Math.round(rsi)}（${rsi < 30 ? "売られすぎ" : rsi > 70 ? "買われすぎ" : "中立"}）`, "オシレーター");
  }
  const bb = bollinger(closes);
  const bu = bb.upper.at(-1), bl = bb.lower.at(-1);
  if (price != null && bu != null && bl != null) {
    const v2: Verdict = price <= bl ? "買い" : price >= bu ? "売り" : "中立";
    push("ボリンジャー(2σ)", v2, price <= bl ? "−2σ以下＝売られすぎ" : price >= bu ? "+2σ以上＝買われすぎ" : "バンド内＝中立", "オシレーター");
  }
  // ストキャスティクス(14)・終値ベース近似。80超=買われすぎ(売り)、20未満=売られすぎ(買い)
  if (v.length >= 14 && price != null) {
    const w = v.slice(-14);
    const lo = Math.min(...w), hi = Math.max(...w);
    const k = hi > lo ? ((price - lo) / (hi - lo)) * 100 : 50;
    const v2: Verdict = k < 20 ? "買い" : k > 80 ? "売り" : "中立";
    push("ストキャス(14)", v2, `%K ${Math.round(k)}（${k < 20 ? "売られすぎ" : k > 80 ? "買われすぎ" : "中立"}）`, "オシレーター");
  }

  const buy = signals.filter((s) => s.verdict === "買い").length;
  const sell = signals.filter((s) => s.verdict === "売り").length;
  const neutral = signals.filter((s) => s.verdict === "中立").length;
  const diff = buy - sell;
  const overall: TechSummary["overall"] =
    diff >= 3 ? "買い寄り" : diff >= 1 ? "やや買い" : diff <= -3 ? "売り寄り" : diff <= -1 ? "やや売り" : "中立";
  return { signals, buy, sell, neutral, overall };
}

// ----------------------------- 保有期間別の売り/継続判定 -----------------------------
export type HVerdict = "売り" | "中立" | "継続";
export interface HorizonDecision {
  label: string;            // 短期 / 中期 / 長期
  period: string;           // 〜1ヶ月 等
  verdict: HVerdict;
  sell: number; hold: number;
  reasons: string[];        // 各指標の根拠（売り/継続）
}

/**
 * 保有期間別（短期〜1ヶ月 / 中期1〜6ヶ月 / 長期半年〜）に「売り / 継続」を判定する。
 * 期間ごとに適した指標群でシグナルを集計し、売り票 > 継続票 なら「売り」とする。
 *   短期: 過熱度・RSI・ストキャス・ボリンジャー・MACD
 *   中期: MACD・一目均衡表・25/75日MA
 *   長期: 200日MA・52週レンジ・一目の雲・センチメント傾き
 * overheat / sentimentTrend は無ければ（ポートフォリオ詳細等）その指標を除外する。
 */
export function holdingHorizons(
  closes: (number | null)[],
  rsi: number | null,
  overheat: number | null,
  sentimentTrend: number | null,
): HorizonDecision[] {
  const v = closes.filter((x): x is number => x != null);
  const price = v.length ? v[v.length - 1] : null;
  if (price == null || v.length < 20) return [];

  const maN = (n: number) => (v.length >= n ? v.slice(-n).reduce((a, b) => a + b, 0) / n : null);
  const ma25 = maN(25), ma75 = maN(75), ma200 = maN(200);
  const macd = macdState(closes);
  const ich = ichimoku(closes);
  const bb = bollinger(closes);
  const bu = bb.upper.at(-1) ?? null, bl = bb.lower.at(-1) ?? null;
  const lt = longTerm(closes);

  type Vote = { v: "sell" | "hold"; reason: string } | null;
  const build = (label: string, period: string, votes: Vote[]): HorizonDecision => {
    const vv = votes.filter((x): x is { v: "sell" | "hold"; reason: string } => x != null);
    const sell = vv.filter((x) => x.v === "sell").length;
    const hold = vv.filter((x) => x.v === "hold").length;
    const verdict: HVerdict = sell > hold ? "売り" : hold > sell ? "継続" : "中立";
    return { label, period, verdict, sell, hold, reasons: vv.map((x) => `${x.v === "sell" ? "▲" : "▼"}${x.reason}`) };
  };

  // 短期（〜1ヶ月）
  const short = build("短期", "〜1ヶ月", [
    overheat == null ? null : overheat >= 60 ? { v: "sell", reason: `過熱度${Math.round(overheat)}（高値圏）` }
      : overheat <= 45 ? { v: "hold", reason: `過熱度${Math.round(overheat)}（落ち着き）` } : null,
    rsi == null ? null : rsi > 70 ? { v: "sell", reason: "RSI買われすぎ" } : rsi < 30 ? { v: "hold", reason: "RSI売られすぎ（押し目）" } : null,
    (() => { if (v.length < 14) return null; const w = v.slice(-14); const lo = Math.min(...w), hi = Math.max(...w); const k = hi > lo ? ((price - lo) / (hi - lo)) * 100 : 50; return k > 80 ? { v: "sell" as const, reason: "ストキャス買われすぎ" } : k < 20 ? { v: "hold" as const, reason: "ストキャス売られすぎ" } : null; })(),
    bu != null && bl != null ? (price >= bu ? { v: "sell", reason: "ボリンジャー+2σ超" } : price <= bl ? { v: "hold", reason: "ボリンジャー−2σ以下" } : null) : null,
    macd ? (macd.bullish ? { v: "hold", reason: "MACD強気" } : { v: "sell", reason: "MACD弱気" }) : null,
  ]);

  // 中期（1〜6ヶ月）
  const mid = build("中期", "1〜6ヶ月", [
    macd ? (macd.bullish ? { v: "hold", reason: "MACD強気" } : { v: "sell", reason: "MACD弱気" }) : null,
    ich.verdict === "売り" ? { v: "sell", reason: `一目 ${ich.cloud}・${ich.tk}` } : ich.verdict === "買い" ? { v: "hold", reason: `一目 ${ich.cloud}・${ich.tk}` } : null,
    ma25 != null ? (price >= ma25 ? { v: "hold", reason: "25日線の上" } : { v: "sell", reason: "25日線の下" }) : null,
    ma75 != null ? (price >= ma75 ? { v: "hold", reason: "75日線の上" } : { v: "sell", reason: "75日線の下" }) : null,
  ]);

  // 長期（半年〜）
  const long = build("長期", "半年〜", [
    ma200 != null ? (price >= ma200 ? { v: "hold", reason: "200日線の上（長期上昇）" } : { v: "sell", reason: "200日線割れ（長期下降）" }) : null,
    lt.rangePct == null ? null : lt.rangePct >= 80 ? { v: "hold", reason: "52週高値圏（上昇基調）" } : lt.rangePct <= 20 ? { v: "sell", reason: "52週安値圏（下降基調）" } : null,
    ich.cloud === "雲の上" ? { v: "hold", reason: "一目 雲の上" } : ich.cloud === "雲の下" ? { v: "sell", reason: "一目 雲の下" } : null,
    sentimentTrend == null ? null : sentimentTrend > 1 ? { v: "hold", reason: "研究熱量が上昇" } : sentimentTrend < -1 ? { v: "sell", reason: "研究熱量が低下" } : null,
  ]);

  return [short, mid, long];
}
