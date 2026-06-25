import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { effectiveDailyLimit } from '../../../../lib/service-limits'
import { json } from '../../../../lib/utils'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const expected = `Bearer ${process.env.BOT_API_SECRET}`

    if (authHeader !== expected) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const serviceKey = searchParams.get('service_key')

    let query = supabaseAdmin
      .from('organization_services')
      .select(`
        id,
        organization_id,
        service_key,
        service_name,
        niche,
        is_enabled,
        email_enabled,
        approval_required,
        daily_limit,
        config_json,
        organizations (
          id,
          name,
          slug,
          type
        )
      `)
      .eq('is_enabled', true)
      .order('service_key', { ascending: true })

    if (serviceKey) {
      query = query.eq('service_key', serviceKey)
    }

    const { data, error } = await query

    if (error) throw error

    return json({
      success: true,
      services: (data ?? []).map((service) => ({
        ...service,
        daily_limit: effectiveDailyLimit(service.service_key, service.daily_limit),
      })),
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
