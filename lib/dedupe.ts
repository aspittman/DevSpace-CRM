import { supabaseAdmin } from './supabase'
import { normalizeDomain, normalizeEmail } from './utils'
import type { IngestLeadInput } from './validators'

export async function findExistingCompany(input: IngestLeadInput) {
  const normalizedDomain = normalizeDomain(input.company.domain || input.company.website)

  if (normalizedDomain) {
    const { data } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('domain', normalizedDomain)
      .maybeSingle()

    if (data) return data
  }

  const { data } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('name', input.company.name)
    .maybeSingle()

  return data
}

export async function findExistingContact(input: IngestLeadInput, companyId: string) {
  const email = normalizeEmail(input.contact?.email)

  if (email) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('email', email)
      .maybeSingle()

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
  const { data } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .eq('source_bot', input.source_bot)
    .eq('lead_type', input.lead.lead_type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}