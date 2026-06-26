-- daily_metricsに75日MA乖離率カラムを追加（ゴールデンクロス判定用: 25日線 vs 75日線）
-- Supabase SQL Editorで実行してください。

alter table daily_metrics
  add column if not exists ma75_deviation numeric(8, 4);

comment on column daily_metrics.ma75_deviation
  is '75日移動平均乖離率 [%]。25日MA乖離率(ma_deviation)と比較してゴールデンクロス判定に使用。';
