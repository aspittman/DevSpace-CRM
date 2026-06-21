import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json, normalizeDomain } from '../../../../lib/utils'
import { buildDomainPerformance } from '../../../../lib/domain-performance'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const expected = `Bearer ${process.env.BOT_API_SECRET}`

    if (authHeader !== expected) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get('organization_id')
    const domain = normalizeDomain(searchParams.get('domain'))

    if (!organizationId) {
      return json({ success: false, error: 'organization_id is required' }, { status: 400 })
    }

    let leadsQuery = supabaseAdmin
      .from('leads')
      .select('id, status, score, source_bot, lead_type, summary, raw_payload, created_at, email_approval_state, domain_lifecycle_state')
      .eq('organization_id', organizationId)
      .in('source_bot', ['domain_merchant', 'apollo_outreach', 'afternic_sync'])

    const { data: leads, error: leadsError } = await leadsQuery.limit(2000)

    if (leadsError) throw leadsError

    const { data: sales, error: salesError } = await supabaseAdmin
      .from('sales_records')
      .select('id, lead_id, customer_name, lead_source, service_sold, deal_value, status, notes, closed_at, created_at, domain_name, raw_payload, purchase_price, gross_profit')
      .eq('organization_id', organizationId)
      .limit(2000)

    if (salesError) throw salesError

    const rows = buildDomainPerformance((leads ?? []) as any[], (sales ?? []) as any[]).filter((row) => {
      if (!domain) return true
      return row.domain === domain
    })

    const totals = rows.reduce(
      (acc, row) => {
        acc.domains += 1
        acc.sent += row.sent
        acc.replies += row.replies
        acc.positive_responses += row.positive_responses
        acc.negative_responses += row.negative_responses
        acc.gross_profit += Number(row.gross_profit ?? 0)
        return acc
      },
      {
        domains: 0,
        sent: 0,
        replies: 0,
        positive_responses: 0,
        negative_responses: 0,
        gross_profit: 0,
      },
    )

    return json({
      success: true,
      organization_id: organizationId,
      domain,
      performance: {
        totals,
        rows,
      },
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
