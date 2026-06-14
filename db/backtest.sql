-- =============================================================================
-- バックテスト結果（実績表示用）
-- -----------------------------------------------------------------------------
-- backend/backtest.py --save が日次/任意で1行 upsert。フロントは最新行を表示。
-- 公開読み取り（anon）/ 書き込みは service_role。
-- =============================================================================

create table if not exists backtest_runs (
    run_date            date not null,
    horizon             smallint not null,         -- 先行リターンの営業日
    n_samples           integer,
    ic_aiba             numeric(6, 3),             -- AIBAスコアのIC（順位相関）
    ic_technical        numeric(6, 3),
    ic_sentiment        numeric(6, 3),
    buy_threshold       numeric(6, 2),             -- 買い判定のAIBA閾値
    buy_count           integer,
    buy_avg_return      numeric(8, 4),             -- 買い銘柄の平均先行リターン[%]
    overall_avg_return  numeric(8, 4),             -- 全体平均[%]
    best_w_l1           numeric(4, 2),             -- 層別 最適テクニカル重み
    best_w_l2           numeric(4, 2),
    best_w_l3           numeric(4, 2),
    created_at          timestamptz not null default now(),
    primary key (run_date, horizon)
);

alter table backtest_runs enable row level security;
drop policy if exists "public read backtest_runs" on backtest_runs;
create policy "public read backtest_runs" on backtest_runs for select using (true);
