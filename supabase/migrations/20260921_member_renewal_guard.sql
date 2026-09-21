-- Prevent duplicate membership renewal requests while a payment is pending.
create unique index if not exists vmc_memberships_one_pending_per_member_idx
  on public.vmc_memberships(member_id)
  where status = 'pending';
