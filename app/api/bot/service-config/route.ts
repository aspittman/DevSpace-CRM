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
    const serviceKey = searchParams.get('service_key')
    const niche = searchParams.get('niche')

    if (!organizationId || !serviceKey) {
      return json(
        { success: false, error: 'organization_id and service_key are required' },
        { status: 400 },
      )
    }

    let query = supabaseAdmin
      .from('organization_services')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('service_key', serviceKey)
      .eq('is_enabled', true)

    if (niche) {
      query = query.eq('niche', niche)
    }

    const { data, error } = await query.maybeSingle()

    if (error) throw error

    if (!data) {
      return json({ success: false, error: 'Service config not found' }, { status: 404 })
    }

    const config = {
      ...(data.config_json ?? {}),
      service_key: data.service_key,
      organization_id: data.organization_id,
      niche: data.niche ?? null,
      enabled: data.is_enabled,
      email_enabled: data.email_enabled,
      approval_required: data.approval_required,
      daily_limit: data.daily_limit,
      feedback_enabled: Boolean(data.config_json?.feedback_enabled),
    }

    return json({
      success: true,
      service: data,
      config,
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
