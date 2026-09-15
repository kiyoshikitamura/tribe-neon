-- Fresh Userと明示的なゲームデータリセットのCASH初期値を2,600へ統一する。
-- 既存ユーザーの現在残高は変更しない。
begin;

alter table public.users
  alter column cash set default 2600;

commit;

notify pgrst,'reload schema';
