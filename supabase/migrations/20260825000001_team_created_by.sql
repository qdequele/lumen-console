-- INSERT ... RETURNING evaluates SELECT policies before the AFTER trigger
-- has inserted the creator's membership row, so "members read their teams"
-- alone rejects the returning row. Record the creator and let them always
-- see their own team.

alter table public.teams
  add column created_by uuid not null default auth.uid() references auth.users (id);

drop policy "members read their teams" on public.teams;

create policy "members and the creator read the team"
  on public.teams for select
  using (public.team_role(id) is not null or created_by = auth.uid());
