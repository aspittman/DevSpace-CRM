import { supabaseAdmin } from './supabase'

export async function logActivity(
  leadId: string | null,
  eventType: string,
  payload: Record<string, unknown> | null = null,
) {
  await supabaseAdmin.from('activity_log').insert({
    lead_id: leadId,
    event_type: eventType,
    payload,
  })
}