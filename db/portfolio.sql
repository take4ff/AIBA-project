-- =============================================================================
-- ポートフォリオ（売り時の可視化）テーブル
-- -----------------------------------------------------------------------------
-- 保有銘柄の「過熱度（売り時）」と損益を可視化する。
-- バッチ(GitHub Actions)が書き込み、フロント(Vercel)は読み取りのみ。
-- =============================================================================

-- 保有銘柄マスタ（config/portfolio.yaml と同期）
create table if not exists portfolio_holdings (
    id          text primary key,
    name        text not null,
    ticker      text not null,
    currency    text not null,            -- JPY / USD
    kind        text not null,            -- direct / proxy
    avg_cost    numeric(14, 4),           -- 取得単価（direct のみ）
    note        text,
    created_at  timestamptz not null default now()
);

-- 日次のテクニカル＋過熱度
create table if not exists portfolio_metrics (
    id            bigint generated always as identity primary key,
    holding_id    text not null references portfolio_holdings(id) on delete cascade,
    trade_date    date not null,
    close_price   numeric(14, 4),
    rsi_14        numeric(6, 2),
    ma_deviation  numeric(8, 4),          -- 25日移動平均乖離率[%]
    overheat      numeric(6, 2),          -- 過熱度(0-100)。高いほど売り時（割高/過熱）
    created_at    timestamptz not null default now(),
    unique (holding_id, trade_date)
);

create index if not exists idx_portfolio_metrics_holding
    on portfolio_metrics (holding_id, trade_date desc);

-- 読み取り(anon)を許可。書き込みは service_role のみ。
alter table portfolio_holdings enable row level security;
alter table portfolio_metrics  enable row level security;

drop policy if exists "public read portfolio_holdings" on portfolio_holdings;
create policy "public read portfolio_holdings" on portfolio_holdings
    for select using (true);

drop policy if exists "public read portfolio_metrics" on portfolio_metrics;
create policy "public read portfolio_metrics" on portfolio_metrics
    for select using (true);
