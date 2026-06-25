import { NextRequest } from 'next/server'
import { json } from '../../../../lib/utils'
import { findEnabledServiceConfig, normalizeServiceNiche } from '../../../../lib/service-config'
import { effectiveDailyLimit } from '../../../../lib/service-limits'

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
    const niche = normalizeServiceNiche(searchParams.get('niche'))

    if (!organizationId || !serviceKey) {
      return json(
        { success: false, error: 'organization_id and service_key are required' },
        { status: 400 },
      )
    }

    const data = await findEnabledServiceConfig(organizationId, serviceKey, niche)

    if (!data) {
      return json({ success: false, error: 'Service config not found' }, { status: 404 })
    }

    const dailyLimit = effectiveDailyLimit(data.service_key, data.daily_limit)
    const config = {
      ...(data.config_json ?? {}),
      service_key: data.service_key,
      organization_id: data.organization_id,
      niche: data.niche ?? null,
      enabled: data.is_enabled,
      email_enabled: data.email_enabled,
      approval_required: data.approval_required,
      daily_limit: dailyLimit,
      feedback_enabled: Boolean(data.config_json?.feedback_enabled),
    }

    return json({
      success: true,
      service: {
        ...data,
        daily_limit: dailyLimit,
      },
      config,
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
