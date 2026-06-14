-- =============================================================================
-- AIBA 予測テーブル (Supabase / PostgreSQL)
-- -----------------------------------------------------------------------------
-- 1ヶ月先(HORIZON営業日)の予測を保持する。
--   pred_aiba    : HORIZON日後のAIBAスコア点予測（平均回帰モデル）
--   buyzone_prob : HORIZON日以内に買い場(AIBA>=60)へ入る確率（校正済みロジスティック）
-- バッチ(GitHub Actions)が書き込み、フロント(Vercel)は読み取りのみ。
-- =============================================================================

create table if not exists predictions (
    id             bigint generated always as identity primary key,
    domain_id      text not null references domains(id) on delete cascade,
    as_of_date     date not null,                  -- 予測の基準日（最新データ日）
    horizon_days   smallint not null,              -- 予測ホライズン（営業日）
    pred_aiba      numeric(6, 2),                  -- HORIZON日後のAIBAスコア予測
    buyzone_prob   numeric(6, 4),                  -- 買い場入り確率 (0-1)
    model_version  text,
    created_at     timestamptz not null default now(),

    unique (domain_id, as_of_date)                  -- 1ドメイン×1基準日で一意（冪等Upsert）
);

create index if not exists idx_predictions_asof on predictions (as_of_date desc);

-- 読み取り(anon)を許可。書き込みは service_role のみ。
alter table predictions enable row level security;
drop policy if exists "public read predictions" on predictions;
create policy "public read predictions" on predictions
    for select using (true);
