-- =============================================================================
-- テーマ別 大衆注目度 (Wikipedia 日次閲覧数) テーブル (Supabase / PostgreSQL)
-- -----------------------------------------------------------------------------
-- attention_job.py が Wikimedia Pageviews API（無料・キー不要）から
-- テーマ関連記事の日次閲覧数を取得し、90日基準線に対する相対水準を
-- attention_score (0-100, 50=平常) として日次で保存する。
--
-- センチメント（GitHub/arXiv等＝研究者・開発者の熱）に対し、こちらは
-- 「一般大衆の関心」。研究熱↑×注目低=仕込み好機 / 注目急騰=過熱警告 の
-- 第2の乖離軸として /themes に表示する。AIBAスコアには混ぜない（表示専用）。
-- =============================================================================

create table if not exists theme_attention (
    id               bigint generated always as identity primary key,
    theme_id         text not null,
    obs_date         date not null,                 -- 閲覧数の対象日（UTC）
    pageviews        bigint,                        -- テーマ内記事の合計日次閲覧数
    attention_score  numeric(6, 2),                 -- 0-100（90日中央値比の相対水準, 50=平常）
    created_at       timestamptz not null default now(),

    unique (theme_id, obs_date)                     -- 冪等Upsert用
);

create index if not exists idx_theme_attention_date on theme_attention (theme_id, obs_date desc);

-- 読み取り(anon)を許可。書き込みは service_role のみ。
alter table theme_attention enable row level security;
drop policy if exists "public read theme_attention" on theme_attention;
create policy "public read theme_attention" on theme_attention
    for select using (true);
