-- =============================================================================
-- シミュレータ・ゲーム（AIBA Trade Sim）— 歴史リプレイ型
-- -----------------------------------------------------------------------------
-- sim_accounts  : プレイヤー口座（現金 + 現在ラウンド）
-- sim_positions : 保有ポジション（クライアントが即時約定で更新）
-- sim_orders    : 取引履歴（全件即時約定、pending なし）
--
-- 設計:
--   フロント（anon + owner RLS）がsim_accounts/sim_positions/sim_ordersを直接更新。
--   注文は daily_metrics の当ラウンド終値で即時約定。週次ジョブ不要。
--   ランキング・評価履歴テーブルなし（個人履歴のみ）。
-- =============================================================================

-- プレイヤー口座
create table if not exists sim_accounts (
    user_id               uuid          primary key references auth.users(id) on delete cascade,
    display_name          text          not null,
    cash                  numeric(18,4) not null default 1000000,
    current_snapshot_date date,              -- 現在のゲームラウンド（NULL=未開始）
    created_at            timestamptz   not null default now()
);
alter table sim_accounts enable row level security;
drop policy if exists "sim accounts select" on sim_accounts;
create policy "sim accounts select" on sim_accounts for select using (auth.uid() = user_id);
drop policy if exists "sim accounts insert" on sim_accounts;
create policy "sim accounts insert" on sim_accounts for insert with check (auth.uid() = user_id);
drop policy if exists "sim accounts update" on sim_accounts;
create policy "sim accounts update" on sim_accounts for update using (auth.uid() = user_id);

-- 保有ポジション（クライアントが即時約定で書き込み）
create table if not exists sim_positions (
    user_id    uuid          references auth.users(id) on delete cascade,
    domain_id  text          not null,
    shares     numeric(18,4) not null,
    avg_cost   numeric(14,4) not null,       -- 平均取得単価（円換算）
    updated_at timestamptz   not null default now(),
    primary key (user_id, domain_id)
);
alter table sim_positions enable row level security;
drop policy if exists "sim positions select" on sim_positions;
create policy "sim positions select" on sim_positions for select using (auth.uid() = user_id);
drop policy if exists "sim positions insert" on sim_positions;
create policy "sim positions insert" on sim_positions for insert with check (auth.uid() = user_id);
drop policy if exists "sim positions update" on sim_positions;
create policy "sim positions update" on sim_positions for update using (auth.uid() = user_id);
drop policy if exists "sim positions delete" on sim_positions;
create policy "sim positions delete" on sim_positions for delete using (auth.uid() = user_id);

-- 取引履歴（即時約定のみ、pending なし）
create table if not exists sim_orders (
    id             bigint generated always as identity primary key,
    user_id        uuid          references auth.users(id) on delete cascade,
    domain_id      text          not null,
    side           text          not null check (side in ('buy','sell')),
    shares         numeric(18,4) not null check (shares > 0),
    fill_price     numeric(14,4) not null,   -- 約定単価（円換算）
    snapshot_date  date          not null,   -- 約定したゲームラウンドの日付
    aiba_at_order  numeric(6,2),             -- 発注時 AIBA（学習記録）
    placed_at      timestamptz   not null default now()
);
create index if not exists idx_sim_orders_user on sim_orders (user_id, placed_at desc);
alter table sim_orders enable row level security;
drop policy if exists "sim orders select" on sim_orders;
create policy "sim orders select" on sim_orders for select using (auth.uid() = user_id);
drop policy if exists "sim orders insert" on sim_orders;
create policy "sim orders insert" on sim_orders for insert with check (auth.uid() = user_id);
