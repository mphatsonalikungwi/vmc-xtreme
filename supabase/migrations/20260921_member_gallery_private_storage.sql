-- VMC member gallery privacy and profile-photo controls
update storage.buckets set public = false where id = 'member-gallery';

drop policy if exists "members can view gallery photos" on storage.objects;
create policy "members can view gallery photos" on storage.objects for select to authenticated
using (bucket_id='member-gallery' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "members can update gallery photos" on storage.objects;
create policy "members can update gallery photos" on storage.objects for update to authenticated
using (bucket_id='member-gallery' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='member-gallery' and (storage.foldername(name))[1]=(select auth.uid())::text);

create unique index if not exists vmc_member_photos_one_profile_idx on public.vmc_member_photos(member_id) where is_profile_photo=true;

create or replace function public.vmc_set_profile_photo(photo_id uuid)
returns void language plpgsql security invoker set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.vmc_member_photos where id=photo_id and member_id=auth.uid()) then raise exception 'photo_not_owned'; end if;
  update public.vmc_member_photos set is_profile_photo=false where member_id=auth.uid();
  update public.vmc_member_photos set is_profile_photo=true where id=photo_id and member_id=auth.uid();
  update public.vmc_profiles set avatar_url=(select storage_path from public.vmc_member_photos where id=photo_id and member_id=auth.uid()),updated_at=now() where id=auth.uid();
end;
$$;
revoke all on function public.vmc_set_profile_photo(uuid) from public;
grant execute on function public.vmc_set_profile_photo(uuid) to authenticated;