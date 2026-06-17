alter table sales_records
add column if not exists domain_name text,
add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_sales_records_domain_name
on sales_records(domain_name);
