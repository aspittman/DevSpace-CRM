create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  type text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key,
  email text,
  full_name text,
  global_role text not null default 'customer',
  created_at timestamptz not null default now()
);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'customer_member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table business_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table organization_business_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_group_id uuid not null references business_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, business_group_id)
);

alter table companies add column organization_id uuid references organizations(id);
alter table contacts add column organization_id uuid references organizations(id);
alter table leads add column organization_id uuid references organizations(id);
alter table bot_runs add column organization_id uuid references organizations(id);
alter table activity_log add column organization_id uuid references organizations(id);
alter table lead_notes add column organization_id uuid references organizations(id);

alter table leads add column business_group_id uuid references business_groups(id);

create index idx_companies_organization_id on companies(organization_id);
create index idx_contacts_organization_id on contacts(organization_id);
create index idx_leads_organization_id on leads(organization_id);
create index idx_leads_business_group_id on leads(business_group_id);
create index idx_bot_runs_organization_id on bot_runs(organization_id);