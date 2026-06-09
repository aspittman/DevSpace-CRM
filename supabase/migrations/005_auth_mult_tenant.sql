create type user_role as enum ('admin', 'customer');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role user_role not null default 'customer',
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table leads add column if not exists organization_id uuid references organizations(id);
alter table bot_runs add column if not exists organization_id uuid references organizations(id);
alter table companies add column if not exists organization_id uuid references organizations(id);

create or replace function is_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

create or replace function my_org_id()
returns uuid
language sql
security definer
as $$
  select organization_id from profiles
  where id = auth.uid();
$$;

alter table profiles enable row level security;
alter table leads enable row level security;
alter table companies enable row level security;
alter table bot_runs enable row level security;

create policy "admins can view all profiles"
on profiles for select
using (is_admin());

create policy "users can view own profile"
on profiles for select
using (id = auth.uid());

create policy "admins can view all leads"
on leads for select
using (is_admin());

create policy "customers can view own org leads"
on leads for select
using (organization_id = my_org_id());

create policy "admins can manage all leads"
on leads for all
using (is_admin())
with check (is_admin());

create policy "admins can view all companies"
on companies for select
using (is_admin());

create policy "customers can view own org companies"
on companies for select
using (organization_id = my_org_id());

create policy "admins can view all bot runs"
on bot_runs for select
using (is_admin());

create policy "customers can view own org bot runs"
on bot_runs for select
using (organization_id = my_org_id());