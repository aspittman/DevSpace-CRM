import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { APOLLO_OUTREACH_BATCH_LIMIT, DEFAULT_DAILY_LIMIT } from '../../../../lib/service-limits'
import { json } from '../../../../lib/utils'
import {
  normalizeServiceNiche,
  numberConfig,
  serviceConfigJsonFromBody,
} from '../../../../lib/service-config'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const expected = `Bearer ${process.env.BOT_API_SECRET}`

    if (authHeader !== expected) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const {
      organization_id,
      service_key,
      service_name,
      niche,
      enabled,
      is_enabled,
      email_enabled,
      approval_required,
      daily_limit,
      max_prospects,
    } = body

    if (!organization_id || !service_key) {
      return json(
        {
          success: false,
          error: 'organization_id and service_key are required',
        },
        { status: 400 },
      )
    }

    const configJson = serviceConfigJsonFromBody(body)
    const serviceNiche = normalizeServiceNiche(niche ?? configJson.niche)
    const configuredMaxProspects = numberConfig(max_prospects ?? configJson.max_prospects)
    const defaultDailyLimit =
      service_key === 'apollo_outreach' ? APOLLO_OUTREACH_BATCH_LIMIT : DEFAULT_DAILY_LIMIT

    const servicePayload = {
      organization_id,
      service_key,
      service_name: service_name ?? service_key.replace(/_/g, ' '),
      niche: serviceNiche,
      is_enabled: is_enabled ?? enabled ?? true,
      email_enabled: email_enabled ?? false,
      approval_required: approval_required ?? true,
      daily_limit: daily_limit ?? configuredMaxProspects ?? defaultDailyLimit,
      config_json: configJson,
      updated_at: new Date().toISOString(),
    }

    let existingQuery = supabaseAdmin
      .from('organization_services')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('service_key', service_key)

    if (serviceNiche) {
      existingQuery = existingQuery.eq('niche', serviceNiche)
    } else {
      existingQuery = existingQuery.is('niche', null)
    }

    const { data: existing, error: existingError } = await existingQuery.maybeSingle()

    if (existingError) throw existingError

    const query = existing
      ? supabaseAdmin
          .from('organization_services')
          .update(servicePayload)
          .eq('id', existing.id)
      : supabaseAdmin.from('organization_services').insert(servicePayload)

    const { data, error } = await query
      .select()
      .single()

    if (error) throw error

    return json({
      success: true,
      service: data,
    })
  } catch (error) {
    console.error(error)

    return json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}
