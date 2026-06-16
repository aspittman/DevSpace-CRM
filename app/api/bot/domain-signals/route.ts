import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json } from '../../../../lib/utils'

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
      .select('id, status, score, source_bot, lead_type, summary, raw_payload, created_at')
      .eq('organization_id', organizationId)
      .in('source_bot', ['domain_merchant', 'afternic_sync'])

    const { data: leads, error: leadsError } = await leadsQuery

    if (leadsError) throw leadsError

    let salesQuery = supabaseAdmin
      .from('sales_records')
      .select('*')
      .eq('organization_id', organizationId)

    const { data: sales, error: salesError } = await salesQuery

    if (salesError) throw salesError

    const filteredLeads = (leads ?? []).filter((lead: any) => {
      if (!niche) return true
      return getMetadataValue(lead.raw_payload, 'niche') === niche
    })

    const soldSales = (sales ?? []).filter((sale: any) => {
      return ['sold', 'closed_won', 'won'].includes(String(sale.status).toLowerCase())
    })

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

    return json({
      success: true,
      organization_id: organizationId,
      niche,
      signals: {
        total_domain_records: totalDomains,
        sold_count: soldCount,
        total_revenue: totalRevenue,
        average_sale_price: soldCount > 0 ? totalRevenue / soldCount : 0,
        top_keywords: topKeywords,
        recent_domains: filteredLeads.slice(0, 25),
      },
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}