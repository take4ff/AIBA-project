-- =============================================================================
-- インサイダー売買 (SEC EDGAR Form 4) テーブル (Supabase / PostgreSQL)
-- -----------------------------------------------------------------------------
-- insider_job.py が SEC EDGAR（無料・公式API）から米国銘柄の Form 4
-- （役員・大株主の自社株売買報告）を取得して保存する。
-- 公開市場での買い(P)・売り(S)のみ保持し、報酬付与・オプション行使等の
-- ノイズは除外。銘柄詳細ページに「インサイダー売買（直近90日）」として表示。
-- =============================================================================

create table if not exists insider_trades (
    id             bigint generated always as identity primary key,
    ticker         text not null,                  -- 銘柄（targets.yaml の米国個別株）
    accession_no   text not null,                  -- EDGAR アクセッション番号
    tx_seq         smallint not null default 0,    -- 同一報告書内の取引連番
    filed_at       date not null,                  -- 提出日
    tx_date        date,                           -- 取引日
    insider_name   text,                           -- 役員・大株主名
    insider_role   text,                           -- 役職（CEO/CFO/Director 等）
    tx_code        text not null,                  -- P=公開市場買い / S=公開市場売り
    shares         numeric(16, 2),                 -- 株数
    price          numeric(14, 4),                 -- 単価 (USD)
    value_usd      numeric(16, 2),                 -- 取引額 = shares × price
    created_at     timestamptz not null default now(),

    unique (accession_no, tx_seq)                   -- 冪等Insert用
);

create index if not exists idx_insider_ticker on insider_trades (ticker, filed_at desc);

-- 読み取り(anon)を許可。書き込みは service_role のみ。
alter table insider_trades enable row level security;
drop policy if exists "public read insider_trades" on insider_trades;
create policy "public read insider_trades" on insider_trades
    for select using (true);
