-- Multi-tenant console schema: accounts come from Supabase Auth; this adds
-- teams, memberships, invitations, and per-team gateway registrations.
--
-- Trust model:
--   * Clients talk to public tables through RLS only.
--   * gateway_secrets has RLS enabled and NO policies: only the console
--     server (service role) can touch it. It stores the gateway master key
--     encrypted by the console server (AES-256-GCM under
--     CONSOLE_ENCRYPTION_KEY) — defense in depth, the DB alone can't
--     recover a master key.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('admin', 'viewer')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, email)
);

create table public.gateways (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  region text not null default 'unspecified',
  url text not null check (url ~ '^https?://'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.gateway_secrets (
  gateway_id uuid primary key references public.gateways (id) on delete cascade,
  -- base64(iv || ciphertext || gcm tag), encrypted server-side.
  master_key_ciphertext text not null,
  updated_at timestamptz not null default now()
);

create index team_members_user_idx on public.team_members (user_id);
create index gateways_team_idx on public.gateways (team_id);
create index invitations_email_idx on public.invitations (lower(email));

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies never self-reference team_members,
-- which would recurse).

create or replace function public.team_role(team uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select role from team_members
  where team_id = team and user_id = auth.uid()
$$;

create or replace function public.is_team_admin(team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.team_role(team) in ('owner', 'admin'), false)
$$;

-- The creator of a team becomes its owner atomically.
create or replace function public.handle_team_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into team_members (team_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  return new;
end;
$$;

create trigger team_insert_owner
after insert on public.teams
for each row execute function public.handle_team_insert();

-- Claim every pending invitation addressed to the calling user's email.
-- Returns the number of teams joined. SECURITY DEFINER because the caller
-- is not yet a member and could not otherwise read or delete the rows.
create or replace function public.claim_invitations()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  claimed integer := 0;
  user_email text;
  invite record;
begin
  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then
    return 0;
  end if;
  for invite in
    select * from invitations where lower(email) = lower(user_email)
  loop
    insert into team_members (team_id, user_id, role)
    values (invite.team_id, auth.uid(), invite.role)
    on conflict (team_id, user_id) do nothing;
    delete from invitations where id = invite.id;
    claimed := claimed + 1;
  end loop;
  return claimed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security.

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.invitations enable row level security;
alter table public.gateways enable row level security;
alter table public.gateway_secrets enable row level security;
-- gateway_secrets: no policies on purpose — service role only.

create policy "members read their teams"
  on public.teams for select
  using (public.team_role(id) is not null);

create policy "any authenticated user creates a team"
  on public.teams for insert
  with check (auth.uid() is not null);

create policy "owners update their team"
  on public.teams for update
  using (public.team_role(id) = 'owner');

create policy "owners delete their team"
  on public.teams for delete
  using (public.team_role(id) = 'owner');

create policy "members see the roster"
  on public.team_members for select
  using (public.team_role(team_id) is not null);

create policy "admins manage the roster"
  on public.team_members for insert
  with check (public.is_team_admin(team_id));

create policy "admins change roles"
  on public.team_members for update
  using (public.is_team_admin(team_id));

create policy "admins remove members, members remove themselves"
  on public.team_members for delete
  using (public.is_team_admin(team_id) or user_id = auth.uid());

create policy "admins and the invitee see invitations"
  on public.invitations for select
  using (
    public.is_team_admin(team_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "admins create invitations"
  on public.invitations for insert
  with check (public.is_team_admin(team_id));

create policy "admins revoke invitations"
  on public.invitations for delete
  using (public.is_team_admin(team_id));

create policy "members read team gateways"
  on public.gateways for select
  using (public.team_role(team_id) is not null);

create policy "admins register gateways"
  on public.gateways for insert
  with check (public.is_team_admin(team_id));

create policy "admins update gateways"
  on public.gateways for update
  using (public.is_team_admin(team_id));

create policy "admins remove gateways"
  on public.gateways for delete
  using (public.is_team_admin(team_id));
