update organization_services
set
  daily_limit = 500,
  updated_at = now()
where service_key = 'apollo_outreach'
  and daily_limit = 25;
