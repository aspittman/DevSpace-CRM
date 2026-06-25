import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json } from '../../../../lib/utils'
import { APOLLO_OUTREACH_BATCH_LIMIT } from '../../../../lib/service-limits'
import {
  configuredStatuses,
  leadActionBase,
  leadDomain,
  leadMatchesNiche,
  parsePositiveInteger,
  saleDomain,
  serviceConfig,
} from '../../../../lib/bot-next-actions'

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

    let serviceQuery = supabaseAdmin
      .from('organization_services')
      .select('*')
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

    if (!service) {
      return json({
        success: true,
        organization_id: organizationId,
        service_key: 'apollo_outreach',
        next_action: {
          type: 'idle',
          reason: 'service_not_enabled',
          items: [],
        },
      })
    }

    const config = serviceConfig(service)
    const limit = parsePositiveInteger(
      searchParams.get('limit'),
      APOLLO_OUTREACH_BATCH_LIMIT,
      APOLLO_OUTREACH_BATCH_LIMIT,
    )
    const minScore = Number(config.min_score ?? config.apollo_min_score ?? 60)
    const candidateStatuses = configuredStatuses(config, 'candidate_statuses', [
      'new',
      'reviewing',
      'ready_to_contact',
      'qualified',
    ])

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, status, score, source_bot, lead_type, summary, raw_payload, created_at')
      .eq('organization_id', organizationId)
      .eq('source_bot', 'domain_merchant')
      .eq('lead_type', 'domain_candidate')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (leadsError) throw leadsError

    const { data: outreachLeads, error: outreachError } = await supabaseAdmin
      .from('leads')
      .select('id, status, raw_payload, created_at')
      .eq('organization_id', organizationId)
      .eq('source_bot', 'apollo_outreach')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (outreachError) throw outreachError

    const { data: sales, error: salesError } = await supabaseAdmin
      .from('sales_records')
      .select('id, lead_id, customer_name, lead_source, service_sold, deal_value, status, notes, closed_at, created_at, domain_name, raw_payload')
      .eq('organization_id', organizationId)
      .limit(1000)

    if (salesError) throw salesError

    const contactedDomains = new Set(
      (outreachLeads ?? [])
        .map((lead: any) => leadDomain(lead))
        .filter((domain: string | null): domain is string => Boolean(domain)),
    )
    const closedDomains = new Set(
      (sales ?? [])
        .filter((sale: any) => ['sold', 'closed_won', 'won'].includes(String(sale.status ?? '').toLowerCase()))
        .map((sale: any) => saleDomain(sale))
        .filter((domain: string | null): domain is string => Boolean(domain)),
    )

    const items = (leads ?? [])
      .filter((lead: any) => {
        const domain = leadDomain(lead)
        const status = String(lead.status ?? '').toLowerCase()
        const score = Number(lead.score ?? 0)

        return (
          Boolean(domain) &&
          leadMatchesNiche(lead, niche) &&
          score >= minScore &&
          candidateStatuses.includes(status) &&
          !contactedDomains.has(domain as string) &&
          !closedDomains.has(domain as string)
        )
      })
      .slice(0, limit)
      .map((lead: any) => ({
        ...leadActionBase(lead, leadDomain(lead) as string),
        suggested_action: 'find_buyers_and_start_outreach',
      }))

    return json({
      success: true,
      organization_id: organizationId,
      service_id: service.id,
      service_key: 'apollo_outreach',
      niche,
      next_action: {
        type: items.length > 0 ? 'start_outreach' : 'idle',
        reason: items.length > 0 ? null : 'no_eligible_domain_candidates',
        approval_required: service.approval_required,
        email_enabled: service.email_enabled,
        daily_limit: APOLLO_OUTREACH_BATCH_LIMIT,
        batch_limit: APOLLO_OUTREACH_BATCH_LIMIT,
        min_score: minScore,
        items,
      },
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
