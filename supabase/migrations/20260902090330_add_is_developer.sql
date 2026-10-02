-- 開発者（アプリ提供側）アカウントの識別フラグ。
--
-- role とは別軸の列。role='admin'（店舗運営）の検索や isAdmin() の判定には
-- 一切影響しない。supabase-mirror.ts の .eq('role','admin') も従来どおり動作する。
--
-- 既定は false のため、適用しても既存の挙動は変わらない。
-- 有効化するには対象アカウントの is_developer を true にすること
-- （Table Editor でチェックを入れるか、docs/sql/add_is_developer.sql の UPDATE を実行）。

alter table public.therapists
  add column if not exists is_developer boolean not null default false;

comment on column public.therapists.is_developer is
  '開発者（アプリ提供側）アカウント。運営・セラピストは false。表示制御と開発者限定機能のガードに使用。';
