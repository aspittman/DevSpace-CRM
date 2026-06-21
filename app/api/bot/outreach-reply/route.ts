import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { logActivity } from '../../../../lib/activity'
import { isOutreachStatus, mergeLeadMetadata } from '../../../../lib/outreach'
import { json, normalizeDomain, normalizeEmail } from '../../../../lib/utils'

const replySchema = z.object({
  organization_id: z.string().uuid(),
  lead_id: z.string().uuid().optional().nullable(),
  message_id: z.string().optional().nullable(),
  thread_id: z.string().optional().nullable(),
  to_email: z.string().email().optional().nullable(),
  from_email: z.string().email().optional().nullable(),
  domain: z.string().optional().nullable(),
  provider: z.string().optional().nullable(),
  received_at: z.string().datetime().optional(),
  subject: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
})

function normalizedOutcome(value: string | null | undefined) {
  const status = String(value ?? 'responded').toLowerCase()
  return isOutreachStatus(status) ? status : 'responded'
}

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get('authorization') !== `Bearer ${process.env.BOT_API_SECRET}`) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = replySchema.safeParse(await req.json())

    if (!parsed.success) {
      return json(
        { success: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const input = parsed.data
    const outcome = normalizedOutcome(input.outcome)
    const receivedAt = input.received_at ?? new Date().toISOString()

    let query = supabaseAdmin
      .from('leads')
      .select('id, organization_id, raw_payload')
      .eq('organization_id', input.organization_id)

    if (input.lead_id) {
      query = query.eq('id', input.lead_id)
    } else if (input.message_id) {
      query = query.eq('raw_payload->metadata->>message_id', input.message_id)
    } else if (input.thread_id) {
      query = query.eq('raw_payload->metadata->>thread_id', input.thread_id)
    } else if (input.from_email) {
      query = query.eq('raw_payload->metadata->>to_email', normalizeEmail(input.from_email))
    } else {
      return json(
        { success: false, error: 'lead_id, message_id, thread_id, or from_email is required' },
        { status: 400 },
      )
    }

    const { data: lead, error: leadError } = await query
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (leadError) throw leadError
    if (!lead) return json({ success: false, error: 'Outreach lead not found' }, { status: 404 })

    const rawPayload = mergeLeadMetadata(lead, {
      outreach_status: outcome,
      last_reply_at: receivedAt,
      reply_message_id: input.message_id ?? null,
      reply_thread_id: input.thread_id ?? null,
      reply_from_email: normalizeEmail(input.from_email),
      reply_to_email: normalizeEmail(input.to_email),
      reply_subject: input.subject ?? null,
      reply_body: input.body ?? null,
      reply_provider: input.provider ?? null,
      domain: normalizeDomain(input.domain) ?? input.domain ?? null,
    })

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({
        status: outcome,
        email_approval_state: 'responded',
        raw_payload: rawPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)
      .select()
      .single()

    if (error) throw error

    await logActivity(lead.id, 'outreach_reply', {
      organization_id: input.organization_id,
      outcome,
      received_at: receivedAt,
      message_id: input.message_id ?? null,
      thread_id: input.thread_id ?? null,
      to_email: normalizeEmail(input.to_email),
      from_email: normalizeEmail(input.from_email),
      domain: input.domain ?? null,
      provider: input.provider ?? null,
      subject: input.subject ?? null,
      body: input.body ?? null,
    })

    if (['unsubscribed', 'bounced'].includes(outcome) && input.from_email) {
      const email = normalizeEmail(input.from_email)
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('outreach_suppressions')
        .select('id')
        .eq('organization_id', input.organization_id)
        .eq('email', email)
        .maybeSingle()

      if (existingError) throw existingError

      const payload = {
        organization_id: input.organization_id,
        email,
        company_domain: normalizeDomain(input.domain),
        reason: outcome,
        source: input.provider ?? 'reply',
        updated_at: new Date().toISOString(),
      }

      const suppressionQuery = existing
        ? supabaseAdmin.from('outreach_suppressions').update(payload).eq('id', existing.id)
        : supabaseAdmin.from('outreach_suppressions').insert(payload)

      const { error: suppressionError } = await suppressionQuery
      if (suppressionError) throw suppressionError
    }

    return json({ success: true, data })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
