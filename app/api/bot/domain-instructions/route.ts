import { NextRequest } from 'next/server'
import { buildDomainInstructions } from '../../../../lib/domain-intelligence'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json } from '../../../../lib/utils'

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
      .eq('service_key', 'domain_merchant')
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
      return json({ success: false, error: 'domain_merchant service config not found' }, { status: 404 })
    }

    const leadLimit = Number(service.config_json?.lead_history_limit ?? 1000)
    const salesLimit = Number(service.config_json?.sales_history_limit ?? 500)

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, status, score, source_bot, lead_type, summary, raw_payload, created_at')
      .eq('organization_id', organizationId)
      .in('source_bot', ['domain_merchant', 'apollo_outreach', 'afternic_sync'])
      .order('created_at', { ascending: false })
      .limit(leadLimit)

    if (leadsError) throw leadsError

    const { data: sales, error: salesError } = await supabaseAdmin
      .from('sales_records')
      .select('id, lead_id, customer_name, lead_source, service_sold, deal_value, status, notes, closed_at, created_at, domain_name, raw_payload')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(salesLimit)

    if (salesError) throw salesError

    const filteredLeads = (leads ?? []).filter((lead: any) => {
      if (!niche) return true
      return lead.raw_payload?.metadata?.niche === niche
    })

    const filteredSales = (sales ?? []).filter((sale: any) => {
      if (!niche) return true
      return sale.raw_payload?.niche === niche || sale.raw_payload?.metadata?.niche === niche
    })

    const config = {
      ...(service.config_json ?? {}),
      daily_limit: service.daily_limit,
    }

    return json({
      success: true,
      organization_id: organizationId,
      service_id: service.id,
      niche,
      instructions: buildDomainInstructions({
        leads: filteredLeads as any[],
        sales: filteredSales as any[],
        serviceConfig: config,
      }),
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
