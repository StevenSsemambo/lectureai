alter table public.sessions add column if not exists lecturer_cleared_at timestamptz;
-- lecturer_clear_sessions(course, ids|null, clear) hides/restores sessions on the lecturer dashboard only (owner-checked, security definer)
