revoke execute on function public.vmc_complete_password_change() from public;
grant execute on function public.vmc_complete_password_change() to authenticated;
alter function public.vmc_complete_password_change()
  security invoker
  set search_path = '';