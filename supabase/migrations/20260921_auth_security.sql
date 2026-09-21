-- VMC authentication security migration source.
-- Applied to the hosted project during the authentication build.

revoke update on public.vmc_profiles from authenticated;
grant update (full_name, phone, email, avatar_url, date_of_birth, gender, emergency_contact)
  on public.vmc_profiles to authenticated;

drop policy if exists "vmc_profiles_own_update" on public.vmc_profiles;
create policy "vmc_profiles_own_update"
on public.vmc_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.vmc_complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.vmc_profiles
  set must_change_password = false,
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.vmc_complete_password_change() from public;
grant execute on function public.vmc_complete_password_change() to authenticated;
