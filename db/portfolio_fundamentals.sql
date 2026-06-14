-- =============================================================================
-- ポートフォリオに決算・ファンダ情報カラムを追加（個別株のみ値が入る）
-- 既存の portfolio_holdings に対するマイグレーション。
-- =============================================================================

alter table portfolio_holdings add column if not exists quote_type          text;        -- EQUITY / ETF 等
alter table portfolio_holdings add column if not exists next_earnings_date   date;        -- 次回決算日
alter table portfolio_holdings add column if not exists last_surprise_pct    numeric(8, 2); -- 直近決算サプライズ[%]
alter table portfolio_holdings add column if not exists trailing_pe          numeric(10, 2); -- 実績PER
alter table portfolio_holdings add column if not exists forward_pe           numeric(10, 2); -- 予想PER
alter table portfolio_holdings add column if not exists eps_growth           numeric(10, 4); -- EPS成長(直近四半期)
alter table portfolio_holdings add column if not exists revenue_growth       numeric(10, 4); -- 売上成長
alter table portfolio_holdings add column if not exists fundamentals_updated_at timestamptz;
