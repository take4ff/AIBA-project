-- =============================================================================
-- latest_metrics ビュー (Supabase / PostgreSQL)
-- -----------------------------------------------------------------------------
-- フロントの全ランキング集計（frontend/lib/data.ts buildAllRows）が必要とする
-- 「ドメインごとの最新行＋前営業日AIBA＋約45日前のセンチメント/終値＋最新予測」を
-- DB側で集約して返す。従来はdaily_metrics 45日分（約1万行・ページング11リクエスト）
-- をフロントで集約していたが、本ビューなら約235行・1リクエストで済む。
--
-- フロントはビューが存在すればこれを使い、無ければ従来ロジックへ自動フォールバック
-- するため、適用タイミングは任意（Supabase SQL Editor で本ファイルを実行）。
-- security_invoker により基表（daily_metrics / predictions）のRLSが適用される。
-- =============================================================================

create or replace view latest_metrics
with (security_invoker = true) as
with recent as (
    select domain_id, trade_date, aiba_score, technical_score, sentiment_score,
           rsi_14, ma_deviation, ma75_deviation, ma200_deviation, close_price,
           row_number() over (partition by domain_id order by trade_date desc) as rn
    from daily_metrics
    where trade_date >= current_date - 45
),
oldest as (
    -- 期間内で最も古い行（センチメント/株価の45日傾き算出用）
    select distinct on (domain_id)
           domain_id, sentiment_score as past_sentiment, close_price as past_close
    from daily_metrics
    where trade_date >= current_date - 45
    order by domain_id, trade_date asc
),
latest_pred as (
    select distinct on (domain_id)
           domain_id, buyzone_prob, pred_aiba
    from predictions
    where as_of_date >= current_date - 45
    order by domain_id, as_of_date desc
)
select
    l.domain_id, l.trade_date, l.aiba_score, l.technical_score, l.sentiment_score,
    l.rsi_14, l.ma_deviation, l.ma75_deviation, l.ma200_deviation, l.close_price,
    p.aiba_score    as prev_aiba,
    o.past_sentiment,
    o.past_close,
    pr.buyzone_prob,
    pr.pred_aiba
from recent l
left join recent p        on p.domain_id = l.domain_id and p.rn = 2
left join oldest o        on o.domain_id = l.domain_id
left join latest_pred pr  on pr.domain_id = l.domain_id
where l.rn = 1;

grant select on latest_metrics to anon, authenticated;
