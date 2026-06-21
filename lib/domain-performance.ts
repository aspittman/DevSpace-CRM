import { domainFromLead, domainFromSale, metadataValue } from './domain-intelligence'
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
  email_approval_state?: string | null
  domain_lifecycle_state?: string | null
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
  purchase_price?: number | string | null
  gross_profit?: number | string | null
}

export type DomainPerformanceRow = {
  domain: string
  niche: string | null
  category: string | null
  outcome: string | null
  status: string | null
  response_status: string | null
  purchase_intent: string | null
  offer_amount: number | null
  sale_price: number | null
  purchase_price: number | null
  gross_profit: number | null
  positive_responses: number
  negative_responses: number
  replies: number
  sent: number
  outreach_count: number
  buyer_terms: string[]
  action_terms: string[]
  target_price: number | null
  ask_price: number | null
  resale_likelihood_score: number | null
  email_approval_state: string | null
  domain_lifecycle_state: string | null
  last_activity_at: string | null
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function initialRow(domain: string): DomainPerformanceRow {
  return {
    domain,
    niche: null,
    category: null,
    outcome: null,
    status: null,
    response_status: null,
    purchase_intent: null,
    offer_amount: null,
    sale_price: null,
    purchase_price: null,
    gross_profit: null,
    positive_responses: 0,
    negative_responses: 0,
    replies: 0,
    sent: 0,
    outreach_count: 0,
    buyer_terms: [],
    action_terms: [],
    target_price: null,
    ask_price: null,
    resale_likelihood_score: null,
    email_approval_state: null,
    domain_lifecycle_state: null,
    last_activity_at: null,
  }
}

function newerTimestamp(current: string | null, next: string | null | undefined) {
  if (!next) return current
  if (!current) return next
  return new Date(next).getTime() > new Date(current).getTime() ? next : current
}

function inferLifecycle(row: DomainPerformanceRow) {
  if (row.domain_lifecycle_state) return row.domain_lifecycle_state
  if (row.sale_price != null || ['sold', 'closed_won', 'won'].includes(String(row.status).toLowerCase())) return 'sold'
  if (row.outreach_count > 0) return 'listed'
  if (row.resale_likelihood_score != null) return 'candidate'
  return null
}

export function buildDomainPerformance(leads: LeadRecord[], sales: SaleRecord[]) {
  const rows = new Map<string, DomainPerformanceRow>()

  const getRow = (domain: string) => {
    const normalized = normalizeDomain(domain)
    if (!normalized) return null
    if (!rows.has(normalized)) rows.set(normalized, initialRow(normalized))
    return rows.get(normalized) as DomainPerformanceRow
  }

  for (const lead of leads) {
    const domain = normalizeDomain(domainFromLead(lead))
    if (!domain) continue

    const row = getRow(domain)
    if (!row) continue

    const metadata = lead.raw_payload?.metadata ?? {}
    const status = String(lead.status ?? '').toLowerCase()

    row.niche = row.niche ?? stringValue(metadata.niche)
    row.category = row.category ?? stringValue(metadata.category)
    row.status = row.status ?? lead.status
    row.response_status = row.response_status ?? stringValue(metadata.response_status) ?? status
    row.purchase_intent = row.purchase_intent ?? stringValue(metadata.purchase_intent)
    row.offer_amount = row.offer_amount ?? numeric(metadata.offer_amount)
    row.target_price = row.target_price ?? numeric(metadata.target_price)
    row.ask_price = row.ask_price ?? numeric(metadata.ask_price) ?? numeric(metadata.asking_price) ?? numeric(metadata.price)
    row.purchase_price = row.purchase_price ?? numeric(metadata.purchase_price)
    row.resale_likelihood_score = Math.max(row.resale_likelihood_score ?? 0, Number(lead.score ?? 0))
    row.email_approval_state =
      row.email_approval_state ?? lead.email_approval_state ?? stringValue(metadata.email_approval_state)
    row.domain_lifecycle_state =
      row.domain_lifecycle_state ?? lead.domain_lifecycle_state ?? stringValue(metadata.domain_lifecycle_state)
    row.buyer_terms = unique([...row.buyer_terms, ...stringArray(metadataValue(lead.raw_payload, 'buyer_terms'))])
    row.action_terms = unique([...row.action_terms, ...stringArray(metadataValue(lead.raw_payload, 'action_terms'))])
    row.last_activity_at = newerTimestamp(row.last_activity_at, lead.created_at)

    if (lead.source_bot === 'apollo_outreach') {
      row.outreach_count += 1
      if (status === 'sent') row.sent += 1
      if (['responded', 'positive', 'negative', 'offer_received'].includes(status)) row.replies += 1
      if (['responded', 'positive', 'offer_received'].includes(status)) row.positive_responses += 1
      if (['negative', 'bounced', 'unsubscribed'].includes(status)) row.negative_responses += 1
      row.outcome = row.outcome ?? stringValue(metadata.outcome) ?? status
    }
  }

  for (const sale of sales) {
    const domain = normalizeDomain(domainFromSale(sale))
    if (!domain) continue

    const row = getRow(domain)
    if (!row) continue

    const salePrice = numeric(sale.deal_value) ?? numeric(sale.raw_payload?.sale_price)
    const purchasePrice = numeric(sale.purchase_price) ?? numeric(sale.raw_payload?.purchase_price)

    row.status = sale.status ?? row.status
    row.outcome = sale.status ?? row.outcome
    row.sale_price = salePrice ?? row.sale_price
    row.purchase_price = purchasePrice ?? row.purchase_price
    row.gross_profit =
      numeric(sale.gross_profit) ??
      numeric(sale.raw_payload?.gross_profit) ??
      (salePrice != null && purchasePrice != null ? salePrice - purchasePrice : row.gross_profit)
    row.niche = row.niche ?? stringValue(sale.raw_payload?.niche) ?? stringValue(sale.raw_payload?.metadata?.niche)
    row.domain_lifecycle_state = ['sold', 'closed_won', 'won'].includes(String(sale.status ?? '').toLowerCase())
      ? 'sold'
      : row.domain_lifecycle_state ?? 'listed'
    row.last_activity_at = newerTimestamp(row.last_activity_at, sale.closed_at ?? sale.created_at)
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      domain_lifecycle_state: inferLifecycle(row),
    }))
    .sort((a, b) => new Date(b.last_activity_at ?? 0).getTime() - new Date(a.last_activity_at ?? 0).getTime())
}
