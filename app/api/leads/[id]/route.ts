import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import { json } from '@/lib/utils'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select(`
      *,
      companies (*),
      contacts (*),
      lead_notes (*),
      activity_log (*)
    `)
    .eq('id', id)
    .single()

  if (error) return json({ success: false, error: error.message }, { status: 500 })
  return json({ success: true, data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update({
      status: body.status,
      score: body.score,
      summary: body.summary,
      owner_user_id: body.owner_user_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return json({ success: false, error: error.message }, { status: 500 })

  await logActivity(id, 'status_changed', {
    status: body.status ?? null,
  })

  return json({ success: true, data })
}