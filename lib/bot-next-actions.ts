import { domainFromLead, domainFromSale, metadataValue, termsFromPayload } from './domain-intelligence'
import { normalizeDomain } from './utils'

type LeadRecord = {
  id: string
  status: string | null
  score: number | null
  source_bot: string | null
  lead_type: string | null
  summary: string | null
  raw_payload: any
  created_at: string
}

type SaleRecord = {
  id: string
  lead_id: string | null
  customer_name: string | null
  lead_source: string | null
  service_sold: string | null
  deal_value: number | string | null
  status: string | null
  notes: string | null
  closed_at: string | null
  created_at: string
  domain_name?: string | null
  raw_payload?: any
}

type ServiceRecord = {
  id: string
  organization_id: string
  service_key: string
  service_name: string
  niche: string | null
  is_enabled: boolean
  email_enabled: boolean
  approval_required: boolean
  daily_limit: number
  config_json: Record<string, any> | null
}

export function parsePositiveInteger(input: string | null, fallback: number, max: number) {
  const parsed = Number(input)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, max)
}

export function serviceConfig(service: ServiceRecord) {
  return service.config_json ?? {}
}

export function metadataArray(payload: any, key: string) {
  const value = metadataValue(payload, key)
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function leadDomain(lead: Pick<LeadRecord, 'raw_payload'>) {
  return normalizeDomain(domainFromLead(lead))
}

export function saleDomain(sale: Pick<SaleRecord, 'domain_name' | 'service_sold' | 'raw_payload'>) {
  return normalizeDomain(domainFromSale(sale))
}

export function configuredStatuses(config: Record<string, any>, key: string, fallback: string[]) {
  const value = config[key]
  return Array.isArray(value) && value.every((status) => typeof status === 'string')
    ? value.map((status) => status.toLowerCase())
    : fallback
}

export function leadMatchesNiche(lead: LeadRecord, niche: string | null) {
  if (!niche) return true
  return metadataValue(lead.raw_payload, 'niche') === niche
}

export function leadActionBase(lead: LeadRecord, domain: string) {
  const metadata = lead.raw_payload?.metadata ?? {}

  return {
    lead_id: lead.id,
    domain,
    status: lead.status,
    score: lead.score ?? 0,
    summary: lead.summary,
    niche: typeof metadata.niche === 'string' ? metadata.niche : null,
    keywords: metadataArray(lead.raw_payload, 'keywords'),
    buyer_terms: metadataArray(lead.raw_payload, 'buyer_terms'),
    action_terms: metadataArray(lead.raw_payload, 'action_terms'),
    weighted_terms: termsFromPayload(lead.raw_payload),
    created_at: lead.created_at,
  }
}

export function firstNumericMetadata(payload: any, keys: string[]) {
  for (const key of keys) {
    const value = metadataValue(payload, key)
    const numberValue = typeof value === 'string' ? Number(value) : value

    if (typeof numberValue === 'number' && Number.isFinite(numberValue)) {
      return numberValue
    }
  }

  return null
}

