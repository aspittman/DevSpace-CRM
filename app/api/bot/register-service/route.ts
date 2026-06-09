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

    const { organization_id, service_key, service_name, status } = body

    if (!organization_id || !service_key || !service_name) {
      return json(
        {
          success: false,
          error: 'organization_id, service_key, and service_name are required',
        },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin
      .from('organization_services')
      .upsert(
        {
          organization_id,
          service_key,
          service_name,
          status: status ?? 'active',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'organization_id,service_key',
        },
      )
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