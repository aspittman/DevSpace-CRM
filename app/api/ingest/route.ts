import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import { findExistingCompany, findExistingContact, findExistingLead } from '@/lib/dedupe'
import { normalizeDomain, normalizeEmail, json } from '@/lib/utils'
import { ingestLeadSchema } from '@/lib/validators'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const expected = `Bearer ${process.env.BOT_API_SECRET}`

    if (authHeader !== expected) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ingestLeadSchema.safeParse(body)

    if (!parsed.success) {
      return json(
        { success: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const input = parsed.data
    const normalizedDomain = normalizeDomain(input.company.domain || input.company.website)
    const normalizedEmail = normalizeEmail(input.contact?.email)

    let company = await findExistingCompany(input)

    if (!company) {
      const { data, error } = await supabaseAdmin
        .from('companies')
        .insert({
          name: input.company.name,
          website: input.company.website ?? null,
          domain: normalizedDomain,
          industry: input.company.industry ?? null,
          city: input.company.city ?? null,
          state: input.company.state ?? null,
          source_bot: input.source_bot,
        })
        .select()
        .single()

      if (error) throw error
      company = data
    }

    let contact = null

    if (input.contact) {
      contact = await findExistingContact(input, company.id)

      if (!contact) {
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .insert({
            company_id: company.id,
            name: input.contact.name ?? null,
            email: normalizedEmail,
            phone: input.contact.phone ?? null,
            title: input.contact.title ?? null,
            linkedin_url: input.contact.linkedin_url ?? null,
          })
          .select()
          .single()

        if (error) throw error
        contact = data
      }
    }

    const existingLead = await findExistingLead(input, company.id)

    if (existingLead) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .update({
          contact_id: contact?.id ?? existingLead.contact_id,
          score: input.lead.score,
          summary: input.lead.summary ?? existingLead.summary,
          pain_points: input.lead.pain_points,
          raw_payload: body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id)
        .select()
        .single()

      if (error) throw error

      await logActivity(data.id, 'lead_updated', {
        source_bot: input.source_bot,
        lead_type: input.lead.lead_type,
      })

      return json({
        success: true,
        action: 'updated',
        company_id: company.id,
        contact_id: contact?.id ?? null,
        lead_id: data.id,
      })
    }

    const { data: newLead, error: leadError } = await supabaseAdmin
      .from('leads')
      .insert({
        company_id: company.id,
        contact_id: contact?.id ?? null,
        source_bot: input.source_bot,
        lead_type: input.lead.lead_type,
        status: 'new',
        score: input.lead.score,
        summary: input.lead.summary ?? null,
        pain_points: input.lead.pain_points,
        raw_payload: body,
      })
      .select()
      .single()

    if (leadError) throw leadError

    await logActivity(newLead.id, 'bot_ingested', {
      source_bot: input.source_bot,
      lead_type: input.lead.lead_type,
    })

    await logActivity(newLead.id, 'lead_created', {
      company_id: company.id,
      contact_id: contact?.id ?? null,
    })

    return json({
      success: true,
      action: 'created',
      company_id: company.id,
      contact_id: contact?.id ?? null,
      lead_id: newLead.id,
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}