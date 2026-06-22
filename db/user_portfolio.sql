-- =============================================================================
-- ユーザー別ポートフォリオ（ログインアカウントに紐付け）
-- -----------------------------------------------------------------------------
-- user_holdings        : 各ユーザーの保有銘柄（本人のみ閲覧・編集 / RLS）
-- ticker_metrics       : ティッカー単位の日次テクニカル＋過熱度（共有・公開読み取り）
-- ticker_fundamentals  : ティッカー単位の決算・ファンダ（共有・公開読み取り）
-- バッチ(service_role)が全ユーザーの保有ティッカーをまとめて計算して
-- ticker_* に保存。フロントは user_holdings（自分）× ticker_*（共有）を結合表示。
-- =============================================================================

create table if not exists user_holdings (
    user_id    uuid not null references auth.users(id) on delete cascade,
    ticker     text not null,
    name       text,
    currency   text not null default 'JPY',     -- JPY / USD
    avg_cost   numeric(14, 4),                   -- 取得単価
    shares     numeric(18, 4),                   -- 保有数（任意・絶対損益用）
    created_at timestamptz not null default now(),
    primary key (user_id, ticker)
);

-- 投資信託（基準価額の無料安定APIが無いため、同じ指数を追う代用ETFで評価する）。
--   ticker      = 代用ETF/指数のティッカー（スコア・シグナル・チャートはこれで算出）
--   name        = 投信の表示名
--   is_fund     = 投信フラグ（true で「投信(代用)」表示・評価ロジック切替）
--   acquired_on = 取得日（代用ETFのこの日からのリターンで評価額・損益を概算）
--   principal   = 取得額（投資元本・通貨建て総額）。shares は口数（任意・表示用）
alter table user_holdings add column if not exists is_fund     boolean not null default false;
alter table user_holdings add column if not exists acquired_on date;
alter table user_holdings add column if not exists principal   numeric(18, 4);

alter table user_holdings enable row level security;
drop policy if exists "own holdings select" on user_holdings;
create policy "own holdings select" on user_holdings for select using (auth.uid() = user_id);
drop policy if exists "own holdings insert" on user_holdings;
create policy "own holdings insert" on user_holdings for insert with check (auth.uid() = user_id);
drop policy if exists "own holdings update" on user_holdings;
create policy "own holdings update" on user_holdings for update using (auth.uid() = user_id);
drop policy if exists "own holdings delete" on user_holdings;
create policy "own holdings delete" on user_holdings for delete using (auth.uid() = user_id);

create table if not exists ticker_metrics (
    ticker       text not null,
    trade_date   date not null,
    close_price  numeric(14, 4),
    rsi_14       numeric(6, 2),
    ma_deviation numeric(8, 4),
    overheat     numeric(6, 2),                  -- 過熱度(0-100)。高いほど売り時
    created_at   timestamptz not null default now(),
    primary key (ticker, trade_date)
);
create index if not exists idx_ticker_metrics on ticker_metrics (ticker, trade_date desc);
alter table ticker_metrics enable row level security;
drop policy if exists "public read ticker_metrics" on ticker_metrics;
create policy "public read ticker_metrics" on ticker_metrics for select using (true);

create table if not exists ticker_fundamentals (
    ticker             text primary key,
    quote_type         text,
    next_earnings_date date,
    last_surprise_pct  numeric(8, 2),
    trailing_pe        numeric(10, 2),
    forward_pe         numeric(10, 2),
    eps_growth         numeric(10, 4),
    revenue_growth     numeric(10, 4),
    updated_at         timestamptz
);
-- 事業の頑丈さ（品質スコア）用の指標。収益性・財務健全性・キャッシュ創出。
alter table ticker_fundamentals add column if not exists operating_margin    numeric(8, 4);   -- 営業利益率（比率）
alter table ticker_fundamentals add column if not exists roe                numeric(8, 4);   -- 自己資本利益率（比率）
alter table ticker_fundamentals add column if not exists debt_to_equity     numeric(10, 2);  -- D/E（％表記・yfinance準拠）
alter table ticker_fundamentals add column if not exists current_ratio      numeric(8, 2);   -- 流動比率
alter table ticker_fundamentals add column if not exists free_cashflow      numeric(20, 0);  -- フリーCF（通貨建て）
alter table ticker_fundamentals add column if not exists market_cap         numeric(22, 0);  -- 時価総額（規模の伸びしろ判定用）
-- ハイリスク・グロース銘柄の買い判断材料
alter table ticker_fundamentals add column if not exists psr                numeric(10, 2);  -- 株価売上高倍率（Price/Sales）
alter table ticker_fundamentals add column if not exists gross_margin       numeric(8, 4);   -- 売上総利益率（比率）
alter table ticker_fundamentals add column if not exists burn_rate_monthly  numeric(20, 0);  -- 月次バーンレート（通貨建て）。営業CFがマイナスの場合のみ
alter table ticker_fundamentals add column if not exists cash_runway_months numeric(8, 1);   -- キャッシュランウェイ（月）= 現金 ÷ 月次バーンレート
alter table ticker_fundamentals enable row level security;
drop policy if exists "public read ticker_fundamentals" on ticker_fundamentals;
create policy "public read ticker_fundamentals" on ticker_fundamentals for select using (true);
