import { supabaseAdmin } from './supabase-admin'
import { isEmailOutreachSourceBot, outreachBody, outreachEmail, outreachSubject } from './outreach'
import { normalizeDomain, normalizeEmail } from './utils'
import type { IngestLeadInput } from './validators'

export async function findExistingCompany(input: IngestLeadInput) {
  const normalizedDomain = normalizeDomain(input.company.domain || input.company.website)
  const organizationId = input.organization_id ?? null

  if (normalizedDomain) {
    let query = supabaseAdmin
      .from('companies')
      .select('*')
      .eq('domain', normalizedDomain)

    if (organizationId) query = query.eq('organization_id', organizationId)

    const { data } = await query.maybeSingle()

    if (data) return data
  }

  let query = supabaseAdmin
    .from('companies')
    .select('*')
    .eq('name', input.company.name)

  if (organizationId) query = query.eq('organization_id', organizationId)

  const { data } = await query.maybeSingle()

  return data
}

export async function findExistingContact(input: IngestLeadInput, companyId: string) {
  const email = normalizeEmail(input.contact?.email) ?? normalizeEmail(outreachEmail({ raw_payload: input }))
  const organizationId = input.organization_id ?? null

  if (email) {
    let query = supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('email', email)

    if (organizationId) query = query.eq('organization_id', organizationId)

    const { data } = await query.maybeSingle()

    if (data) return data
  }

  if (input.contact?.name) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .eq('name', input.contact.name)
      .maybeSingle()

    return data
  }

  return null
}

export async function findExistingLead(input: IngestLeadInput, companyId: string) {
  const domain = normalizeDomain(input.metadata?.domain as string | undefined) ?? normalizeDomain(input.company.domain || input.company.website)
  const email = normalizeEmail(input.contact?.email) ?? normalizeEmail(outreachEmail({ raw_payload: input }))
  const metadataIdentity = outreachMetadataIdentity(input.metadata)

  const baseQuery = () => supabaseAdmin
    .from('leads')
    .select('*')
    .eq('organization_id', input.organization_id)
    .eq('company_id', companyId)
    .eq('source_bot', input.source_bot)
    .eq('lead_type', input.lead.lead_type)

  if (isEmailOutreachSourceBot(input.source_bot)) {
    if (metadataIdentity) {
      const { data } = await baseQuery()
        .eq(`raw_payload->metadata->>${metadataIdentity.key}`, metadataIdentity.value)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return data
    }

    if (!email) return null

    let emailQuery = baseQuery().eq('raw_payload->contact->>email', email)
    if (domain) {
      emailQuery = emailQuery.eq('raw_payload->metadata->>domain', domain)
    }

    const { data } = await emailQuery
      .order('created_at', { ascending: false })
      .limit(50)

    const incomingSubject = outreachSubject({ raw_payload: input })
    const incomingBody = outreachBody({ raw_payload: input })

    if (!incomingSubject && !incomingBody) return null

    return (data ?? []).find((lead) => {
      const existingSubject = outreachSubject(lead)
      const existingBody = outreachBody(lead)

      return (
        (!incomingSubject || existingSubject === incomingSubject) &&
        (!incomingBody || existingBody === incomingBody)
      )
    }) ?? null
  }

  let query = baseQuery()

  if (domain) {
    query = query.eq('raw_payload->metadata->>domain', domain)
  }
  if (email) {
    query = query.eq('raw_payload->contact->>email', email)
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

function outreachMetadataIdentity(metadata: IngestLeadInput['metadata']) {
  const keys = [
    'outreach_id',
    'draft_id',
    'email_draft_id',
    'message_id',
    'thread_id',
    'apollo_email_id',
  ]

  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) {
      return { key, value: value.trim() }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { key, value: String(value) }
    }
  }

  return null
}
