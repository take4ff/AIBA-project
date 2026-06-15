-- =============================================================================
-- ベンチマーク指数の日次終値（エクイティカーブ比較用）
-- -----------------------------------------------------------------------------
-- backend/benchmark_job.py が指数（例: ACWI 全世界株）の終値を upsert。
-- /verify の疑似エクイティカーブで「インデックス放置」線として表示。
-- 公開読み取り（anon）/ 書き込みは service_role。
-- =============================================================================

create table if not exists benchmark_prices (
    trade_date  date not null,
    ticker      text not null,
    close       numeric,
    primary key (trade_date, ticker)
);

alter table benchmark_prices enable row level security;
drop policy if exists "public read benchmark_prices" on benchmark_prices;
create policy "public read benchmark_prices" on benchmark_prices for select using (true);
