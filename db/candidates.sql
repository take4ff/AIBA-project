-- =============================================================================
-- 新興テーマ候補（ユニバース未採用）の研究熱量
-- -----------------------------------------------------------------------------
-- backend/candidates_job.py が候補キーワードのセンチメント熱量を実測して upsert。
-- フロント /themes が「これから伸びてきそうな候補」として熱量順に表示。
-- 公開読み取り（anon）/ 書き込みは service_role。
-- =============================================================================

create table if not exists candidate_themes (
    candidate_id  text primary key,
    name          text not null,
    keywords      text[],
    heat_score    numeric(6, 2),                 -- センチメント熱量（50=横ばい, >50=加速）
    updated_at    timestamptz not null default now()
);

alter table candidate_themes enable row level security;
drop policy if exists "public read candidate_themes" on candidate_themes;
create policy "public read candidate_themes" on candidate_themes for select using (true);
