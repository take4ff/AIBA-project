-- =============================================================================
-- AIBA データベーススキーマ (Supabase / PostgreSQL)
-- -----------------------------------------------------------------------------
-- 無料枠(500MB)を最大限活かすため、計算済みの「日次サマリー」のみを保持する。
-- 生データ(分足など)は保存しない。
-- =============================================================================

-- 監視対象ドメインのマスタ（config/targets.yaml と同期）
create table if not exists domains (
    id           text primary key,                 -- 例: advanced_semiconductor
    name         text not null,                     -- 表示名（日本語可）
    layer        smallint not null check (layer in (1, 2, 3)),
    ticker       text not null,
    created_at   timestamptz not null default now()
);

-- 日次サマリー（スコア・テクニカル・センチメントの確定値）
create table if not exists daily_metrics (
    id            bigint generated always as identity primary key,
    domain_id     text not null references domains(id) on delete cascade,
    trade_date    date not null,                    -- 対象取引日(米国市場ベース)

    -- テクニカル指標（事実）
    close_price   numeric(14, 4),                   -- 終値
    volume        bigint,                           -- 出来高
    rsi_14        numeric(6, 2),                     -- RSI(14日)
    ma_deviation  numeric(8, 4),                     -- 移動平均(25日)乖離率 [%]

    -- センチメント指標（先行）
    github_score      numeric(8, 4),                 -- GitHub熱量(リポジトリ増減ベース)
    arxiv_score       numeric(8, 4),                 -- arXiv論文出現率ベース
    sentiment_score   numeric(6, 2),                 -- 統合センチメントスコア(0-100)

    -- 統合
    technical_score   numeric(6, 2),                 -- 統合テクニカルスコア(0-100)
    aiba_score        numeric(6, 2),                 -- 最終AIBAスコア(0-100)

    created_at    timestamptz not null default now(),

    unique (domain_id, trade_date)                   -- 1ドメイン×1日で一意（冪等Insert）
);

-- 階層別ランキング・時系列取得を高速化
create index if not exists idx_daily_metrics_date  on daily_metrics (trade_date desc);
create index if not exists idx_daily_metrics_domain on daily_metrics (domain_id, trade_date desc);

-- -----------------------------------------------------------------------------
-- Row Level Security: フロントエンド(anon/publishableキー)からの読み取りを許可。
-- 書き込みは service_role キー（RLSをバイパス）でのみ行う想定。
-- -----------------------------------------------------------------------------
alter table domains       enable row level security;
alter table daily_metrics enable row level security;

drop policy if exists "public read domains" on domains;
create policy "public read domains" on domains
    for select using (true);

drop policy if exists "public read daily_metrics" on daily_metrics;
create policy "public read daily_metrics" on daily_metrics
    for select using (true);

-- 最新日の階層別ランキングを取得するビュー（フロントエンド用）
create or replace view latest_ranking as
select
    d.layer,
    d.id          as domain_id,
    d.name        as domain_name,
    d.ticker,
    m.trade_date,
    m.aiba_score,
    m.technical_score,
    m.sentiment_score,
    m.rsi_14,
    m.ma_deviation,
    m.close_price
from daily_metrics m
join domains d on d.id = m.domain_id
where m.trade_date = (select max(trade_date) from daily_metrics)
order by d.layer, m.aiba_score desc;
