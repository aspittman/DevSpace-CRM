-- In this CRM, the legacy "approved" rows were messages the owner sent
-- manually. Normalize them to sent so API consumers and the Sent tab agree.
update leads
set status = 'sent',
    email_approval_state = 'sent',
    raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object(
      'metadata',
      coalesce(raw_payload->'metadata', '{}'::jsonb) || jsonb_build_object(
        'outreach_status', 'sent',
        'sent_at', coalesce(raw_payload #>> '{metadata,sent_at}', updated_at::text, created_at::text),
        'provider', coalesce(raw_payload #>> '{metadata,provider}', 'Manual / historical'),
        'outreach_source', coalesce(raw_payload #>> '{metadata,outreach_source}', 'manual')
      )
    ),
    updated_at = now()
where source_bot in ('apollo_outreach', 'devspace_outreach')
  and coalesce(raw_payload #>> '{metadata,outreach_status}', email_approval_state, status) = 'approved';
