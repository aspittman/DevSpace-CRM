create extension if not exists pgcrypto;

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  domain text unique,
  industry text,
  city text,
  state text,
  source_bot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text,
  email text,
  phone text,
  title text,
  linkedin_url text,
  verified_status text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  source_bot text not null,
  lead_type text not null,
  status text not null default 'new',
  score integer not null default 0,
  summary text,
  pain_points jsonb not null default '[]'::jsonb,
  raw_payload jsonb,
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  user_id uuid,
  body text not null,
  created_at timestamptz not null default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table bot_runs (
  id uuid primary key default gen_random_uuid(),
  bot_name text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  records_found integer not null default 0,
  records_inserted integer not null default 0,
  duplicates_detected integer not null default 0,
  errors jsonb
);

create index idx_companies_name on companies(name);
create index idx_companies_domain on companies(domain);
create index idx_contacts_company_id on contacts(company_id);
create index idx_contacts_email on contacts(email);
create index idx_leads_company_id on leads(company_id);
create index idx_leads_contact_id on leads(contact_id);
create index idx_leads_source_bot on leads(source_bot);
create index idx_leads_status on leads(status);
create index idx_leads_score on leads(score);
create index idx_leads_created_at on leads(created_at desc);
create index idx_lead_notes_lead_id on lead_notes(lead_id);
create index idx_activity_log_lead_id on activity_log(lead_id);
create index idx_activity_log_created_at on activity_log(created_at desc);
create index idx_bot_runs_bot_name on bot_runs(bot_name);
create index idx_bot_runs_started_at on bot_runs(started_at desc);