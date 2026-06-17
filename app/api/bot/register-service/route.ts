import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json } from '../../../../lib/utils'

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
      is_enabled,
      email_enabled,
      approval_required,
      daily_limit,
      config_json,
    } = body

    if (!organization_id || !service_key || !service_name) {
      return json(
        {
          success: false,
          error: 'organization_id, service_key, and service_name are required',
        },
        { status: 400 },
      )
    }

    const servicePayload = {
      organization_id,
      service_key,
      service_name,
      niche: niche ?? null,
      is_enabled: is_enabled ?? true,
      email_enabled: email_enabled ?? false,
      approval_required: approval_required ?? true,
      daily_limit: daily_limit ?? 25,
      config_json: config_json ?? {},
      updated_at: new Date().toISOString(),
    }

    let existingQuery = supabaseAdmin
      .from('organization_services')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('service_key', service_key)

    if (niche) {
      existingQuery = existingQuery.eq('niche', niche)
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
