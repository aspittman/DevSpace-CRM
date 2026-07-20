-- Apollo outreach remains review-first. The CRM approval action sends the
-- reviewed message immediately using its configured SMTP provider.
update organization_services
set email_enabled = true,
    approval_required = true,
    updated_at = now()
where service_key = 'apollo_outreach';

-- These records were manually sent before provider acknowledgements were
-- tracked, so preserve them as historical sent outreach without resending.
update leads
set status = 'sent',
    email_approval_state = 'sent',
    raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object(
      'metadata',
      coalesce(raw_payload->'metadata', '{}'::jsonb) || jsonb_build_object(
        'outreach_status', 'sent',
        'sent_at', coalesce(updated_at, created_at),
        'provider', 'Manual / historical',
        'outreach_source', 'manual'
      )
    ),
    updated_at = now()
where source_bot = 'apollo_outreach'
  and coalesce(email_approval_state, status) = 'approved';
