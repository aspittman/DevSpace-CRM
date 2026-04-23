import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabase'
import { logActivity } from '../../../../../lib/activity'
import { json } from '../../../../../lib/utils'

// ...existing code...

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('lead_notes')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  if (error) return json({ success: false, error: error.message }, { status: 500 })
  return json({ success: true, data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('lead_notes')
    .insert({
      lead_id: id,
      body: body.body,
    })
    .select()
    .single()

  if (error) return json({ success: false, error: error.message }, { status: 500 })

  await logActivity(id, 'note_added', { body: body.body })

  return json({ success: true, data })
}