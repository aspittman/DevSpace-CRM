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

export function metadataValue(payload: any, key: string) {
  return payload?.metadata?.[key] ?? null
}

export function domainFromLead(lead: Pick<LeadRecord, 'raw_payload'>) {
  return (
    metadataValue(lead.raw_payload, 'domain') ??
    lead.raw_payload?.company?.domain ??
    lead.raw_payload?.company?.website ??
    null
  )
}

export function domainFromSale(sale: Pick<SaleRecord, 'domain_name' | 'service_sold' | 'raw_payload'>) {
  return (
    sale.domain_name ??
    sale.raw_payload?.domain ??
    sale.raw_payload?.domain_name ??
    sale.raw_payload?.metadata?.domain ??
    sale.service_sold ??
    null
  )
}

function addWeightedTerm(
  stats: Record<string, { term: string; weight: number; seen_count: number; reasons: string[] }>,
  rawTerm: unknown,
  weight: number,
  reason: string,
) {
  if (typeof rawTerm !== 'string') return

  const term = rawTerm.trim().toLowerCase()
  if (!term) return

  if (!stats[term]) {
    stats[term] = { term, weight: 0, seen_count: 0, reasons: [] }
  }

  stats[term].weight += weight
  stats[term].seen_count += 1

  if (!stats[term].reasons.includes(reason)) {
    stats[term].reasons.push(reason)
  }
}

export function termsFromPayload(payload: any) {
  const metadata = payload?.metadata ?? {}
  const terms = [
    ...(Array.isArray(metadata.buyer_terms) ? metadata.buyer_terms : []),
    ...(Array.isArray(metadata.action_terms) ? metadata.action_terms : []),
    ...(Array.isArray(metadata.keywords) ? metadata.keywords : []),
  ]

  if (typeof metadata.niche === 'string') {
    terms.push(metadata.niche)
  }

  return terms
}

export function buildDomainInstructions({
  leads,
  sales,
  serviceConfig,
}: {
  leads: LeadRecord[]
  sales: SaleRecord[]
  serviceConfig: Record<string, any>
}) {
  const termStats: Record<string, { term: string; weight: number; seen_count: number; reasons: string[] }> = {}
  const avoidDomains = new Set<string>()
  const soldDomains = new Set<string>()
  const responsiveDomains = new Set<string>()

  for (const sale of sales) {
    const status = String(sale.status ?? '').toLowerCase()
    const domain = domainFromSale(sale)

    if (domain) {
      avoidDomains.add(String(domain).toLowerCase())
    }

    if (['sold', 'closed_won', 'won'].includes(status)) {
      if (domain) soldDomains.add(String(domain).toLowerCase())

      const saleTerms = [
        ...(Array.isArray(sale.raw_payload?.keywords) ? sale.raw_payload.keywords : []),
        ...(Array.isArray(sale.raw_payload?.metadata?.keywords) ? sale.raw_payload.metadata.keywords : []),
        sale.raw_payload?.niche,
        sale.raw_payload?.metadata?.niche,
      ]

      for (const term of saleTerms) {
        addWeightedTerm(termStats, term, 35, 'afternic_sale')
      }
    }
  }

  for (const lead of leads) {
    const status = String(lead.status ?? '').toLowerCase()
    const score = Number(lead.score ?? 0)
    const domain = domainFromLead(lead)

    if (domain) {
      avoidDomains.add(String(domain).toLowerCase())
    }

    if (lead.source_bot === 'apollo_outreach' && ['replied', 'qualified', 'closed_won'].includes(status)) {
      if (domain) responsiveDomains.add(String(domain).toLowerCase())
      for (const term of termsFromPayload(lead.raw_payload)) {
        addWeightedTerm(termStats, term, 20 + score / 5, 'apollo_positive_response')
      }
    }

    if (lead.source_bot === 'domain_merchant' && lead.lead_type === 'domain_candidate') {
      const weight = status === 'dead' || status === 'closed_lost' ? -10 : Math.max(1, score / 10)
      for (const term of termsFromPayload(lead.raw_payload)) {
        addWeightedTerm(termStats, term, weight, 'domain_candidate_history')
      }
    }
  }

  const configuredKeywords = Array.isArray(serviceConfig.target_keywords)
    ? serviceConfig.target_keywords
    : []

  for (const keyword of configuredKeywords) {
    addWeightedTerm(termStats, keyword, 15, 'service_config')
  }

  const targetKeywords = Object.values(termStats)
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight || b.seen_count - a.seen_count)
    .slice(0, Number(serviceConfig.keyword_limit ?? 25))

  return {
    target_keywords: targetKeywords,
    avoid_domains: Array.from(avoidDomains).slice(0, Number(serviceConfig.avoid_domain_limit ?? 500)),
    sold_domains: Array.from(soldDomains).slice(0, 100),
    responsive_domains: Array.from(responsiveDomains).slice(0, 100),
    search_preferences: {
      max_purchase_price: serviceConfig.max_purchase_price ?? null,
      min_estimated_value: serviceConfig.min_estimated_value ?? null,
      tlds: serviceConfig.tlds ?? ['com'],
      niches: serviceConfig.niches ?? [],
      daily_limit: serviceConfig.daily_limit ?? null,
    },
  }
}
