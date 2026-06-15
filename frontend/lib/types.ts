// ランキング行の型（domains × daily_metrics から構築）。

import { Region, Kind } from "./regions";

export interface RankingRow {
  layer: number;
  region: Region;
  kind: Kind;
  domain_id: string;
  domain_name: string;
  theme_name: string;
  ticker: string;
  trade_date: string;
  aiba_score: number | null;
  technical_score: number | null;
  sentiment_score: number | null;
  rsi_14: number | null;
  ma_deviation: number | null;
  close_price: number | null;
  // 1ヶ月先予測
  buyzone_prob: number | null;   // 買い場(AIBA>=60)入り確率 (0-1)
  pred_aiba: number | null;      // HORIZON日後のAIBAスコア予測
  // 成長シグナル
  sentiment_trend: number;       // 直近のセンチメント変化（＋=熱量上昇）
  price_trend: number;           // 直近の株価変化[%]
  divergence: boolean;           // 乖離: センチメント上昇 × 株価出遅れ ＝仕込み好機
  combo_score: number;           // 成長×割安スコア(0-100)=割安(AIBA)と熱量上昇の合成
  momentum_score: number;        // 順張りモメンタム(0-100)=MA上・RSI強・直近上昇の合成（AIBAの逆張りと対）
  // 並び順キー：その地域の業界ETFスコア（ETF/個別株で同じ業界順に揃えるため）
  order_key: number;
}

export interface MetricHistoryRow {
  trade_date: string;
  aiba_score: number | null;
  technical_score: number | null;
  sentiment_score: number | null;
  rsi_14: number | null;
  ma_deviation?: number | null;
  close_price: number | null;
  bb_upper?: number | null;   // ボリンジャーバンド上限（表示用）
  bb_lower?: number | null;   // ボリンジャーバンド下限（表示用）
}

export const LAYER_META: Record<number, { title: string; subtitle: string }> = {
  1: { title: "第1層：現在のブーム", subtitle: "Current Trend — 過熱が収まった押し目を狙う" },
  2: { title: "第2層：次なる波", subtitle: "Next Wave — バランスの取れた成長を捉える" },
  3: { title: "第3層：未来の開拓地", subtitle: "Future Frontier — 水面下の研究熱量を先取りする" },
};
