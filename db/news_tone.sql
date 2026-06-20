-- =============================================================================
-- テーマ別ニュース論調（GDELT 平均トーン・表示用の独立指標）
-- -----------------------------------------------------------------------------
-- トーンは「水準」（増加率ではない）のため AIBAスコアには混ぜず、表示専用。
-- 週次ジョブ(news_tone_job.py)がテーマごとに更新。共有・公開読み取り。
-- =============================================================================
create table if not exists theme_news_tone (
    theme_id   text primary key,
    tone       numeric(6, 2),               -- 直近30日の平均トーン（おおむね -10〜+10・0=中立）
    updated_at timestamptz not null default now()
);
alter table theme_news_tone enable row level security;
drop policy if exists "public read theme_news_tone" on theme_news_tone;
create policy "public read theme_news_tone" on theme_news_tone for select using (true);
