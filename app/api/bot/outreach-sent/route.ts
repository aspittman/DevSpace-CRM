import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { logActivity } from '../../../../lib/activity'
import { mergeLeadMetadata } from '../../../../lib/outreach'
import { json, normalizeDomain, normalizeEmail } from '../../../../lib/utils'

const sentSchema = z.object({
  organization_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  sent_at: z.string().datetime().optional(),
  message_id: z.string().min(1),
  thread_id: z.string().optional().nullable(),
  provider: z.string().min(1),
  to_email: z.string().email(),
  subject: z.string().min(1),
  domain: z.string().optional().nullable(),
  sending_account: z.string().optional().nullable(),
  mailbox: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get('authorization') !== `Bearer ${process.env.BOT_API_SECRET}`) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = sentSchema.safeParse(await req.json())

    if (!parsed.success) {
      return json(
        { success: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const input = parsed.data
    const sentAt = input.sent_at ?? new Date().toISOString()

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, organization_id, raw_payload')
      .eq('id', input.lead_id)
      .eq('organization_id', input.organization_id)
      .single()

    if (leadError) throw leadError

    const rawPayload = mergeLeadMetadata(lead, {
      outreach_status: 'sent',
      sent_at: sentAt,
      message_id: input.message_id,
      thread_id: input.thread_id ?? null,
      provider: input.provider,
      to_email: normalizeEmail(input.to_email),
      sent_subject: input.subject,
      domain: normalizeDomain(input.domain) ?? input.domain ?? null,
      sending_account: input.sending_account ?? input.mailbox ?? null,
      mailbox: input.mailbox ?? input.sending_account ?? null,
    })

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({
        status: 'sent',
        email_approval_state: 'sent',
        raw_payload: rawPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.lead_id)
      .select()
      .single()

    if (error) throw error

    await logActivity(input.lead_id, 'outreach_sent', {
      organization_id: input.organization_id,
      sent_at: sentAt,
      message_id: input.message_id,
      thread_id: input.thread_id ?? null,
      provider: input.provider,
      to_email: normalizeEmail(input.to_email),
      subject: input.subject,
      domain: input.domain ?? null,
      sending_account: input.sending_account ?? input.mailbox ?? null,
    })

    const normalizedEmail = normalizeEmail(input.to_email)
    const { data: existingSuppression, error: existingSuppressionError } = await supabaseAdmin
      .from('outreach_suppressions')
      .select('id')
      .eq('organization_id', input.organization_id)
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingSuppressionError) throw existingSuppressionError

    const suppressionPayload = {
      organization_id: input.organization_id,
      email: normalizedEmail,
      company_domain: normalizeDomain(input.domain),
      reason: 'already_contacted',
      source: input.provider,
      last_contacted_at: sentAt,
      updated_at: new Date().toISOString(),
    }

    const suppressionQuery = existingSuppression
      ? supabaseAdmin
          .from('outreach_suppressions')
          .update(suppressionPayload)
          .eq('id', existingSuppression.id)
      : supabaseAdmin
          .from('outreach_suppressions')
          .insert({
            ...suppressionPayload,
            created_at: new Date().toISOString(),
          })

    const { error: suppressionError } = await suppressionQuery

    if (suppressionError) throw suppressionError
    return json({ success: true, data })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
