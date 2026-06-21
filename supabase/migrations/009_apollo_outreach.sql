create table outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text,
  company_domain text,
  company_name text,
  reason text not null default 'manual',
  source text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_suppressions_target_check check (
    email is not null or company_domain is not null or company_name is not null
  )
);

create unique index idx_outreach_suppressions_org_email
  on outreach_suppressions (organization_id, lower(email))
  where email is not null;

create unique index idx_outreach_suppressions_org_company_domain
  on outreach_suppressions (organization_id, lower(company_domain))
  where company_domain is not null;

create index idx_outreach_suppressions_organization_id
  on outreach_suppressions (organization_id);

create index idx_outreach_suppressions_reason
  on outreach_suppressions (reason);
