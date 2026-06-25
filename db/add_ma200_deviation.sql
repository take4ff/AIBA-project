-- daily_metricsに200日MA乖離率カラムを追加
-- Supabase SQL Editorで実行してください。

alter table daily_metrics
  add column if not exists ma200_deviation numeric(8, 4);

comment on column daily_metrics.ma200_deviation
  is '200日移動平均乖離率 [%]（正=200日線の上=長期上昇トレンド、負=200日線の下）';
