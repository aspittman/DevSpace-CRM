import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { json, normalizeEmail } from '../../../../lib/utils'
import {
  emailOutreachSourceBots,
  isEmailOutreachSourceBot,
  outreachBody,
  outreachDomain,
  outreachStatus,
  outreachSubject,
} from '../../../../lib/outreach'

function authFailed(req: NextRequest) {
  return req.headers.get('authorization') !== `Bearer ${process.env.BOT_API_SECRET}`
}

export async function GET(req: NextRequest) {
  try {
    if (authFailed(req)) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get('organization_id')
    const requestedSourceBot = searchParams.get('source_bot')
    const sourceBots = isEmailOutreachSourceBot(requestedSourceBot)
      ? [requestedSourceBot]
      : requestedSourceBot === 'all'
        ? [...emailOutreachSourceBots]
        : ['apollo_outreach']
    // Sending programs intentionally receive one message per poll. They must report
    // it through outreach-sent before the next recipient becomes eligible.
    const limit = 1

    if (!organizationId) {
      return json({ success: false, error: 'organization_id is required' }, { status: 400 })
    }

    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select(`
        id,
        organization_id,
        contact_id,
        company_id,
        source_bot,
        status,
        score,
        summary,
        raw_payload,
        created_at,
        updated_at,
        contacts (id, name, email, title),
        companies (id, name, domain, website)
      `)
      .eq('organization_id', organizationId)
      .in('source_bot', sourceBots)
      .in('status', ['approved'])
      .order('updated_at', { ascending: true })
      // Fetch enough candidates to skip incomplete or suppressed rows, then
      // return only the first eligible message below.
      .limit(100)

    if (error) throw error

    const { data: suppressions, error: suppressionError } = await supabaseAdmin
      .from('outreach_suppressions')
      .select('email, company_domain, company_name, reason')
      .eq('organization_id', organizationId)

    if (suppressionError) throw suppressionError

    const suppressedEmails = new Set(
      (suppressions ?? [])
        .map((item: any) => normalizeEmail(item.email))
        .filter((email: string | null): email is string => Boolean(email)),
    )
    const suppressedDomains = new Set(
      (suppressions ?? [])
        .map((item: any) => String(item.company_domain ?? '').toLowerCase())
        .filter(Boolean),
    )

    const seenRecipients = new Set<string>()
    const records = (leads ?? [])
      .filter((lead: any) => outreachStatus(lead) === 'approved')
      .map((lead: any) => {
        const contact = Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts
        const company = Array.isArray(lead.companies) ? lead.companies[0] : lead.companies
        const toEmail = normalizeEmail(contact?.email)
        const domain = outreachDomain(lead)
        const companyDomain = String(company?.domain ?? '').toLowerCase()

        return {
          lead_id: lead.id,
          contact_id: contact?.id ?? lead.contact_id,
          company_id: company?.id ?? lead.company_id,
          organization_id: lead.organization_id,
          source_bot: lead.source_bot,
          to_email: toEmail,
          prospect_name: contact?.name ?? null,
          company_name: company?.name ?? null,
          subject: outreachSubject(lead),
          body: outreachBody(lead),
          from_email: process.env.OUTREACH_FROM_EMAIL ?? 'domains@devspacetechnologies.com',
          domain,
          score: lead.score,
          suppressed:
            !toEmail ||
            suppressedEmails.has(toEmail) ||
            Boolean(companyDomain && suppressedDomains.has(companyDomain)),
        }
      })
      .filter((record) => record.to_email && record.subject && record.body && !record.suppressed)
      .filter((record) => {
        const recipient = record.to_email as string
        if (seenRecipients.has(recipient)) return false
        seenRecipients.add(recipient)
        return true
      })
      .slice(0, limit)

    return json({
      success: true,
      organization_id: organizationId,
      records,
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
