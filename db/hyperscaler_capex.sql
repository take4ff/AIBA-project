-- ハイパースケーラ四半期CAPEX（設備投資額）
-- capex_job.py が yfinance 経由で月次更新する。
create table if not exists hyperscaler_capex (
    id          bigint generated always as identity primary key,
    ticker      text not null,                    -- AMZN / MSFT / GOOGL / META
    quarter     date not null,                    -- 四半期末日 (例: 2024-09-30)
    capex_usd   numeric(18, 0) not null,          -- 設備投資額（ドル）。絶対値で保存
    source      text not null default 'yfinance',
    updated_at  timestamptz not null default now(),
    unique (ticker, quarter)
);

create index if not exists idx_hsc_capex_quarter on hyperscaler_capex (quarter desc);

alter table hyperscaler_capex enable row level security;
drop policy if exists "public read hyperscaler_capex" on hyperscaler_capex;
create policy "public read hyperscaler_capex" on hyperscaler_capex
    for select using (true);
