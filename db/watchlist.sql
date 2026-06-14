-- =============================================================================
-- ウォッチリスト（ユーザーごとのお気に入り）
-- -----------------------------------------------------------------------------
-- Supabase Auth のログインユーザーが、自分の登録分だけ閲覧・編集できる。
-- domain_id は domains への外部キーにしない（バックフィルで domains を
-- 入れ替えるため。お気に入りが消えないようにプレーンな text で保持）。
-- =============================================================================

create table if not exists watchlist (
    user_id     uuid not null references auth.users(id) on delete cascade,
    domain_id   text not null,
    created_at  timestamptz not null default now(),
    primary key (user_id, domain_id)
);

alter table watchlist enable row level security;

-- 自分の行だけ参照・追加・削除できる
drop policy if exists "own watchlist select" on watchlist;
create policy "own watchlist select" on watchlist
    for select using (auth.uid() = user_id);

drop policy if exists "own watchlist insert" on watchlist;
create policy "own watchlist insert" on watchlist
    for insert with check (auth.uid() = user_id);

drop policy if exists "own watchlist delete" on watchlist;
create policy "own watchlist delete" on watchlist
    for delete using (auth.uid() = user_id);
