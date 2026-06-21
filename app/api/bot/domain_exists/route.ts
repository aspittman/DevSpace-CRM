import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json, normalizeDomain } from '../../../../lib/utils'

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

    if (!organizationId || !domain) {
      return json(
        { success: false, error: 'organization_id and domain are required' },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, created_at, source_bot, raw_payload')
      .eq('organization_id', organizationId)
      .contains('raw_payload', { metadata: { domain } })
      .limit(1)

    if (error) throw error

    if ((data ?? []).length > 0) {
      return json({
        success: true,
        exists: true,
        match: data?.[0] ?? null,
      })
    }

    const { data: companies, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id, created_at, source_bot, domain')
      .eq('organization_id', organizationId)
      .eq('domain', domain)
      .limit(1)

    if (companyError) throw companyError

    return json({
      success: true,
      exists: (companies ?? []).length > 0,
      match: companies?.[0] ?? null,
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
