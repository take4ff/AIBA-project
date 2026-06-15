-- =============================================================================
-- 月次クロスセクションIC（先行性の経時評価用）
-- -----------------------------------------------------------------------------
-- backend/ic_monthly_job.py が各月の「日付別 銘柄横断Spearman の月内平均」を算出・upsert。
-- /verify のIC推移グラフが過去〜現在を表示。公開読み取り / 書き込みは service_role。
-- =============================================================================

create table if not exists ic_monthly (
    month         date primary key,        -- その月の最終取引日
    ic_aiba       numeric(6, 3),
    ic_technical  numeric(6, 3),
    ic_sentiment  numeric(6, 3),
    n             integer,                  -- 月内サンプル数
    updated_at    timestamptz not null default now()
);

alter table ic_monthly enable row level security;
drop policy if exists "public read ic_monthly" on ic_monthly;
create policy "public read ic_monthly" on ic_monthly for select using (true);
