import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase'
import { json } from '../../../lib/utils'

// ...existing code...

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const sourceBot = searchParams.get('source_bot')
  const minScore = searchParams.get('min_score')
  const search = searchParams.get('search')

  let query = supabaseAdmin
    .from('leads')
    .select(`
      *,
      companies (*),
      contacts (*)
    `)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (sourceBot) query = query.eq('source_bot', sourceBot)
  if (minScore) query = query.gte('score', Number(minScore))
  if (search) query = query.ilike('summary', `%${search}%`)

  const { data, error } = await query

  if (error) {
    return json({ success: false, error: error.message }, { status: 500 })
  }

  return json({ success: true, data })
}