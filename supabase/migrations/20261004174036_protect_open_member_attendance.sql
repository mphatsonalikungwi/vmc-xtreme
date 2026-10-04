create unique index vmc_attendance_one_open_visit_idx
on public.vmc_attendance (member_id)
where checked_out_at is null;