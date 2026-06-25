-- セクター別月次リターンサマリー
-- S&P500（GICS11セクター）と日本（TOPIX-17セクターETF）の月次騰落率を保持。
-- market_summary_job.py が月1回 upsert する。

create table if not exists market_monthly (
  index_name    text    not null,  -- 'sp500' | 'topix'
  sector        text    not null,
  month         date    not null,  -- 月初日 (YYYY-MM-01)
  avg_return    numeric(8, 4),     -- セクター平均リターン%（sp500）/ ETFリターン%（topix）
  median_return numeric(8, 4),
  best_ticker   text,
  best_return   numeric(8, 4),
  worst_ticker  text,
  worst_return  numeric(8, 4),
  ticker_count  int,
  updated_at    timestamptz default now(),
  primary key (index_name, sector, month)
);

-- public read（ログイン不要で閲覧可能）
alter table market_monthly enable row level security;
create policy "public read" on market_monthly for select using (true);
