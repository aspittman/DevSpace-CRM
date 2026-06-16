alter table leads
add column if not exists organization_id uuid references organizations(id) on delete set null;

create index if not exists idx_leads_organization_id
on leads(organization_id);