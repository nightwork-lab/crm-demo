-- happ の【利用エリア】を保持する列。
--
-- 既存行には値が無いため既定を空文字にする。次回の happ 同期で埋まる。
-- 集計ロジック（order-metrics.ts）はこの列を参照しない。表示専用。

alter table public.happ_orders
  add column if not exists area text not null default '';

comment on column public.happ_orders.area is
  'happ の【利用エリア】。同期前の既存行は空文字。表示専用で集計には使わない。';
