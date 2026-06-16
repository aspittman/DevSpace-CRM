import { NextRequest } from 'next/server'
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
    const domain = searchParams.get('domain')

    if (!organizationId) {
      return json({ success: false, error: 'organization_id is required' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('leads')
      .select('id, status, score, source_bot, lead_type, summary, raw_payload, created_at')
      .eq('organization_id', organizationId)
      .eq('source_bot', 'apollo_outreach')

    const { data, error } = await query

    if (error) throw error

    const leads = (data ?? []).filter((lead: any) => {
      if (!domain) return true
      return lead.raw_payload?.metadata?.domain === domain
    })

    const total = leads.length

    const byStatus = leads.reduce((acc: Record<string, number>, lead: any) => {
      const status = lead.status ?? 'unknown'
      acc[status] = (acc[status] ?? 0) + 1
      return acc
    }, {})

    const averageScore =
      total > 0
        ? leads.reduce((sum: number, lead: any) => sum + Number(lead.score ?? 0), 0) / total
        : 0

    return json({
      success: true,
      organization_id: organizationId,
      domain,
      performance: {
        total_outreach_leads: total,
        average_score: averageScore,
        by_status: byStatus,
        recent_outreach: leads.slice(0, 25),
      },
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}