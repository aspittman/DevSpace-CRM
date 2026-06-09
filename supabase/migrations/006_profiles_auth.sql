create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,

  role text not null check (
    role in ('admin', 'customer')
  ),

  organization_id uuid references organizations(id),

  created_at timestamptz default now()
);

create index if not exists idx_profiles_org
on profiles (organization_id);