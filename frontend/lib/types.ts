// Supabase の latest_ranking ビュー / daily_metrics に対応する型。

export interface RankingRow {
  layer: number;
  domain_id: string;
  domain_name: string;
  ticker: string;
  trade_date: string;
  aiba_score: number | null;
  technical_score: number | null;
  sentiment_score: number | null;
  rsi_14: number | null;
  ma_deviation: number | null;
  close_price: number | null;
}

export interface MetricHistoryRow {
  trade_date: string;
  aiba_score: number | null;
  technical_score: number | null;
  sentiment_score: number | null;
  rsi_14: number | null;
  close_price: number | null;
}

export const LAYER_META: Record<number, { title: string; subtitle: string }> = {
  1: { title: "第1層：現在のブーム", subtitle: "Current Trend — 過熱が収まった押し目を狙う" },
  2: { title: "第2層：次なる波", subtitle: "Next Wave — バランスの取れた成長を捉える" },
  3: { title: "第3層：未来の開拓地", subtitle: "Future Frontier — 水面下の研究熱量を先取りする" },
};
