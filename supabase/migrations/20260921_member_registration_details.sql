-- Member registration supports flexible duration and training mode.
alter table public.vmc_memberships
  add column if not exists training_mode text;

alter table public.vmc_memberships
  drop constraint if exists vmc_memberships_training_mode_check;

alter table public.vmc_memberships
  add constraint vmc_memberships_training_mode_check
  check (training_mode is null or training_mode in (
    'Personal Training',
    'Cardio Training',
    'Muscle Building & Toning',
    'Weight Loss',
    'Group Fitness',
    'Beginner Guidance'
  ));

create index if not exists vmc_memberships_member_status_idx
  on public.vmc_memberships(member_id,status);

create index if not exists vmc_payments_member_date_idx
  on public.vmc_payments(member_id,payment_date desc);
