-- Restore the minimum authenticated write surface required by SettingsPanel.
-- Keep users table currency/progression fields non-writable from the client.
begin;

grant update (username, bio) on table public.users to authenticated;

drop policy if exists users_owner_profile_update on public.users;
create policy users_owner_profile_update on public.users
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

commit;

notify pgrst, 'reload schema';
