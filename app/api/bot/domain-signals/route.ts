import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json, normalizeDomain } from '../../../../lib/utils'
import { buildDomainPerformance } from '../../../../lib/domain-performance'

function getMetadataValue(payload: any, key: string) {
  return payload?.metadata?.[key] ?? null
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const expected = `Bearer ${process.env.BOT_API_SECRET}`

    if (authHeader !== expected) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get('organization_id')
    const niche = searchParams.get('niche')

    if (!organizationId) {
      return json({ success: false, error: 'organization_id is required' }, { status: 400 })
    }

    let leadsQuery = supabaseAdmin
      .from('leads')
      .select('id, status, score, source_bot, lead_type, summary, raw_payload, created_at, email_approval_state, domain_lifecycle_state')
      .eq('organization_id', organizationId)
      .in('source_bot', ['domain_merchant', 'apollo_outreach', 'afternic_sync'])

    const { data: leads, error: leadsError } = await leadsQuery

    if (leadsError) throw leadsError

    let salesQuery = supabaseAdmin
      .from('sales_records')
      .select('id, lead_id, customer_name, lead_source, service_sold, deal_value, status, notes, closed_at, created_at, domain_name, raw_payload, purchase_price, gross_profit')
      .eq('organization_id', organizationId)

    const { data: sales, error: salesError } = await salesQuery

    if (salesError) throw salesError

    let serviceQuery = supabaseAdmin
      .from('organization_services')
      .select('config_json')
      .eq('organization_id', organizationId)
      .eq('service_key', 'apollo_outreach')
      .eq('is_enabled', true)

    if (niche) {
      serviceQuery = serviceQuery.eq('niche', niche)
    }

    const { data: service, error: serviceError } = await serviceQuery
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (serviceError) throw serviceError

    const filteredLeads = (leads ?? []).filter((lead: any) => {
      if (!niche) return true
      return getMetadataValue(lead.raw_payload, 'niche') === niche
    })

    const soldSales = (sales ?? []).filter((sale: any) => {
      return ['sold', 'closed_won', 'won'].includes(String(sale.status).toLowerCase())
    })
    const configuredDomains = Array.isArray(service?.config_json?.domains)
      ? service.config_json.domains
      : Array.isArray(service?.config_json?.offers)
        ? service.config_json.offers
        : []

    const totalDomains = filteredLeads.length
    const soldCount = soldSales.length
    const totalRevenue = soldSales.reduce((sum: number, sale: any) => {
      return sum + Number(sale.deal_value ?? 0)
    }, 0)

    const keywordStats: Record<string, any> = {}

    for (const lead of filteredLeads as any[]) {
      const payload = lead.raw_payload ?? {}
      const metadata = payload.metadata ?? {}

      const buyerTerms = metadata.buyer_terms ?? []
      const actionTerms = metadata.action_terms ?? []
      const terms = [...buyerTerms, ...actionTerms]

      for (const term of terms) {
        if (!keywordStats[term]) {
          keywordStats[term] = {
            term,
            seen_count: 0,
            avg_score: 0,
            total_score: 0,
          }
        }

        keywordStats[term].seen_count += 1
        keywordStats[term].total_score += Number(lead.score ?? 0)
        keywordStats[term].avg_score =
          keywordStats[term].total_score / keywordStats[term].seen_count
      }
    }

    const topKeywords = Object.values(keywordStats)
      .sort((a: any, b: any) => b.avg_score - a.avg_score)
      .slice(0, 20)
    const domainRows = buildDomainPerformance((leads ?? []) as any[], (sales ?? []) as any[])
      .filter((row) => {
        if (niche && row.niche !== niche) return false
        return !['sold', 'rejected', 'expired'].includes(String(row.domain_lifecycle_state ?? '').toLowerCase())
      })
      .sort((a, b) => Number(b.resale_likelihood_score ?? 0) - Number(a.resale_likelihood_score ?? 0))

    return json({
      success: true,
      organization_id: organizationId,
      niche,
      domains: domainRows.map((row) => ({
        domain: row.domain,
        niche: row.niche,
        target_price: row.target_price,
        ask_price: row.ask_price,
        category: row.category,
        buyer_terms: row.buyer_terms,
        action_terms: row.action_terms,
        resale_likelihood_score: row.resale_likelihood_score,
        domain_lifecycle_state: row.domain_lifecycle_state,
        email_approval_state: row.email_approval_state,
      })),
      signals: {
        total_domain_records: totalDomains,
        sold_count: soldCount,
        total_revenue: totalRevenue,
        average_sale_price: soldCount > 0 ? totalRevenue / soldCount : 0,
        top_keywords: topKeywords,
        configured_domains: configuredDomains
          .map((item: any) => ({
            domain: normalizeDomain(item.domain ?? item.domain_name ?? item.website),
            ask_price: item.ask_price ?? item.price ?? null,
            niche: item.niche ?? niche ?? null,
          }))
          .filter((item: any) => item.domain),
        recent_domains: filteredLeads.slice(0, 25).map((lead: any) => ({
          ...lead,
          domain: normalizeDomain(
            lead.raw_payload?.metadata?.domain ??
              lead.raw_payload?.company?.domain ??
              lead.raw_payload?.company?.website,
          ),
          ask_price:
            lead.raw_payload?.metadata?.ask_price ??
            lead.raw_payload?.metadata?.price ??
            null,
          niche: lead.raw_payload?.metadata?.niche ?? null,
        })),
      },
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
