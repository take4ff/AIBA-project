-- =============================================================================
-- スコアの定点記録（out-of-sample 検証用）
-- -----------------------------------------------------------------------------
-- 月1回、その時点の各ドメインのAIBAスコア・買い判定・株価を保存し、
-- 経過後に 1/3/6ヶ月の実リターン(ret_*)を埋めて「スコアの当否」を検証する。
-- backend/snapshot.py が記録＆評価。公開読み取り。
-- =============================================================================

create table if not exists score_snapshots (
    snapshot_date date not null,
    domain_id     text not null,
    aiba_score    numeric(6, 2),
    is_buy        boolean,                 -- スナップ時に買い場(AIBA>=60)だったか
    close_price   numeric(14, 4),          -- スナップ時の終値
    ret_1m        numeric(8, 4),           -- 1ヶ月後リターン[%]（経過後に埋まる）
    ret_3m        numeric(8, 4),
    ret_6m        numeric(8, 4),
    ret_12m       numeric(8, 4),           -- 12ヶ月後リターン[%]
    created_at    timestamptz not null default now(),
    primary key (snapshot_date, domain_id)
);

-- 既存テーブルに後から追加する場合：
alter table score_snapshots add column if not exists ret_12m numeric(8, 4);

create index if not exists idx_snapshots_date on score_snapshots (snapshot_date desc);

alter table score_snapshots enable row level security;
drop policy if exists "public read score_snapshots" on score_snapshots;
create policy "public read score_snapshots" on score_snapshots for select using (true);
