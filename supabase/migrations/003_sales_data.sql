create table sales_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_group_id uuid references business_groups(id),
  lead_id uuid references leads(id) on delete set null,

  customer_name text,
  lead_source text,
  service_sold text,
  deal_value numeric,
  status text not null default 'open',

  pain_points jsonb not null default '[]'::jsonb,
  notes text,

  contacted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sales_records_organization_id on sales_records(organization_id);
create index idx_sales_records_business_group_id on sales_records(business_group_id);
create index idx_sales_records_status on sales_records(status);