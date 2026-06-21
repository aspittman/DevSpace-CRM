alter table leads
add column if not exists email_approval_state text,
add column if not exists domain_lifecycle_state text;

alter table companies
drop constraint if exists companies_domain_key;

create unique index if not exists idx_companies_org_domain_unique
on companies(organization_id, domain)
where organization_id is not null and domain is not null;

alter table leads
drop constraint if exists leads_email_approval_state_check;

alter table leads
add constraint leads_email_approval_state_check
check (
  email_approval_state is null
  or email_approval_state in ('drafted', 'approved', 'sent', 'responded', 'rejected')
);

alter table leads
drop constraint if exists leads_domain_lifecycle_state_check;

alter table leads
add constraint leads_domain_lifecycle_state_check
check (
  domain_lifecycle_state is null
  or domain_lifecycle_state in (
    'candidate',
    'approved_to_buy',
    'purchased',
    'listed',
    'sold',
    'rejected',
    'expired'
  )
);

create index if not exists idx_leads_email_approval_state
on leads(email_approval_state);

create index if not exists idx_leads_domain_lifecycle_state
on leads(domain_lifecycle_state);

alter table sales_records
add column if not exists purchase_price numeric,
add column if not exists gross_profit numeric;

create index if not exists idx_sales_records_purchase_price
on sales_records(purchase_price);

create or replace view domain_intelligence as
with lead_domains as (
  select
    leads.organization_id,
    lower(coalesce(
      leads.raw_payload #>> '{metadata,domain}',
      leads.raw_payload #>> '{metadata,domain_name}',
      leads.raw_payload #>> '{company,domain}',
      leads.raw_payload #>> '{company,website}'
    )) as domain,
    max(leads.raw_payload #>> '{metadata,niche}') as niche,
    max(leads.raw_payload #>> '{metadata,category}') as category,
    max(
      case
        when (leads.raw_payload #>> '{metadata,target_price}') ~ '^[0-9]+(\.[0-9]+)?$'
          then (leads.raw_payload #>> '{metadata,target_price}')::numeric
        else null
      end
    ) as target_price,
    max(coalesce(
      case
        when (leads.raw_payload #>> '{metadata,ask_price}') ~ '^[0-9]+(\.[0-9]+)?$'
          then (leads.raw_payload #>> '{metadata,ask_price}')::numeric
        else null
      end,
      case
        when (leads.raw_payload #>> '{metadata,asking_price}') ~ '^[0-9]+(\.[0-9]+)?$'
          then (leads.raw_payload #>> '{metadata,asking_price}')::numeric
        else null
      end,
      case
        when (leads.raw_payload #>> '{metadata,price}') ~ '^[0-9]+(\.[0-9]+)?$'
          then (leads.raw_payload #>> '{metadata,price}')::numeric
        else null
      end
    )) as ask_price,
    max(
      case
        when (leads.raw_payload #>> '{metadata,purchase_price}') ~ '^[0-9]+(\.[0-9]+)?$'
          then (leads.raw_payload #>> '{metadata,purchase_price}')::numeric
        else null
      end
    ) as lead_purchase_price,
    max(leads.score) as resale_likelihood_score,
    max(leads.status) filter (where leads.source_bot = 'domain_merchant') as domain_merchant_status,
    max(leads.status) filter (where leads.source_bot = 'apollo_outreach') as apollo_status,
    max(leads.email_approval_state) as email_approval_state,
    max(leads.domain_lifecycle_state) as lead_lifecycle_state,
    count(*) filter (where leads.source_bot = 'domain_merchant') as candidate_count,
    count(*) filter (where leads.source_bot = 'apollo_outreach') as outreach_count,
    count(*) filter (where leads.source_bot = 'apollo_outreach' and leads.status = 'sent') as sent,
    count(*) filter (
      where leads.source_bot = 'apollo_outreach'
      and leads.status in ('responded', 'positive', 'negative', 'offer_received')
    ) as replies,
    count(*) filter (
      where leads.source_bot = 'apollo_outreach'
      and leads.status in ('responded', 'positive', 'offer_received')
    ) as positive_responses,
    count(*) filter (
      where leads.source_bot = 'apollo_outreach'
      and leads.status in ('negative', 'bounced', 'unsubscribed')
    ) as negative_responses,
    jsonb_agg(leads.raw_payload #> '{metadata,buyer_terms}') filter (
      where leads.raw_payload #> '{metadata,buyer_terms}' is not null
    ) as buyer_terms,
    jsonb_agg(leads.raw_payload #> '{metadata,action_terms}') filter (
      where leads.raw_payload #> '{metadata,action_terms}' is not null
    ) as action_terms,
    max(leads.created_at) as last_lead_at
  from leads
  where leads.organization_id is not null
  group by leads.organization_id, lower(coalesce(
    leads.raw_payload #>> '{metadata,domain}',
    leads.raw_payload #>> '{metadata,domain_name}',
    leads.raw_payload #>> '{company,domain}',
    leads.raw_payload #>> '{company,website}'
  ))
),
sale_domains as (
  select
    sales_records.organization_id,
    lower(coalesce(
      sales_records.domain_name,
      sales_records.raw_payload #>> '{domain}',
      sales_records.raw_payload #>> '{domain_name}',
      sales_records.raw_payload #>> '{metadata,domain}',
      sales_records.service_sold
    )) as domain,
    max(sales_records.status) as sale_status,
    max(sales_records.deal_value) as sale_price,
    max(sales_records.purchase_price) as purchase_price,
    max(coalesce(
      sales_records.gross_profit,
      sales_records.deal_value - sales_records.purchase_price
    )) as gross_profit,
    max(coalesce(sales_records.closed_at, sales_records.created_at)) as last_sale_at
  from sales_records
  group by sales_records.organization_id, lower(coalesce(
    sales_records.domain_name,
    sales_records.raw_payload #>> '{domain}',
    sales_records.raw_payload #>> '{domain_name}',
    sales_records.raw_payload #>> '{metadata,domain}',
    sales_records.service_sold
  ))
)
select
  coalesce(lead_domains.organization_id, sale_domains.organization_id) as organization_id,
  coalesce(lead_domains.domain, sale_domains.domain) as domain,
  lead_domains.niche,
  lead_domains.category,
  lead_domains.target_price,
  lead_domains.ask_price,
  coalesce(sale_domains.purchase_price, lead_domains.lead_purchase_price) as purchase_price,
  sale_domains.sale_price,
  sale_domains.gross_profit,
  lead_domains.resale_likelihood_score,
  lead_domains.domain_merchant_status,
  lead_domains.apollo_status,
  sale_domains.sale_status,
  lead_domains.email_approval_state,
  case
    when sale_domains.sale_status in ('sold', 'closed_won', 'won') then 'sold'
    when sale_domains.domain is not null then 'listed'
    else lead_domains.lead_lifecycle_state
  end as domain_lifecycle_state,
  coalesce(lead_domains.candidate_count, 0) as candidate_count,
  coalesce(lead_domains.outreach_count, 0) as outreach_count,
  coalesce(lead_domains.sent, 0) as sent,
  coalesce(lead_domains.replies, 0) as replies,
  coalesce(lead_domains.positive_responses, 0) as positive_responses,
  coalesce(lead_domains.negative_responses, 0) as negative_responses,
  coalesce(lead_domains.buyer_terms, '[]'::jsonb) as buyer_terms,
  coalesce(lead_domains.action_terms, '[]'::jsonb) as action_terms,
  greatest(
    coalesce(lead_domains.last_lead_at, '-infinity'::timestamptz),
    coalesce(sale_domains.last_sale_at, '-infinity'::timestamptz)
  ) as updated_at
from lead_domains
full outer join sale_domains
  on lead_domains.organization_id = sale_domains.organization_id
  and lead_domains.domain = sale_domains.domain
where coalesce(lead_domains.domain, sale_domains.domain) is not null;
