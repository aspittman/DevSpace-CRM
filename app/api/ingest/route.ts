import { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { logActivity } from '../../../lib/activity'
import { findExistingCompany, findExistingContact, findExistingLead } from '../../../lib/dedupe'
import { normalizeDomain, normalizeEmail, json } from '../../../lib/utils'
import { ingestLeadSchema } from '../../../lib/validators'
import { isEmailOutreachSourceBot, isOutreachStatus, outreachEmail } from '../../../lib/outreach'
import {
  booleanConfig,
  findEnabledServiceConfig,
  normalizeServiceNiche,
  numberConfig,
} from '../../../lib/service-config'

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

    const organizationId = input.organization_id

    if (!organizationId) {
      return json(
        { success: false, error: 'organization_id is required' },
        { status: 400 },
      )
    }

    const normalizedDomain = normalizeDomain(input.company.domain || input.company.website)
    const normalizedEmail = normalizeEmail(input.contact?.email) ?? normalizeEmail(outreachEmail(body))
    const requestedNiche = normalizeServiceNiche(input.metadata?.niche)
    const serviceConfig = await findEnabledServiceConfig(
      organizationId,
      input.source_bot,
      requestedNiche,
    )
    const configJson = (serviceConfig?.config_json ?? {}) as Record<string, unknown>
    const dryRun = booleanConfig(configJson.dry_run) ?? false
    const minScoreToSave = numberConfig(configJson.min_score_to_save)

    if (dryRun) {
      return json({
        success: true,
        action: 'skipped',
        reason: 'dry_run',
        service_key: input.source_bot,
        niche: serviceConfig?.niche ?? requestedNiche,
      })
    }

    if (minScoreToSave !== null && input.lead.score < minScoreToSave) {
      return json({
        success: true,
        action: 'skipped',
        reason: 'below_min_score_to_save',
        score: input.lead.score,
        min_score_to_save: minScoreToSave,
        service_key: input.source_bot,
        niche: serviceConfig?.niche ?? requestedNiche,
      })
    }

    const metadataStatus = input.metadata?.outreach_status
    const requestedStatus = isOutreachStatus(metadataStatus) ? metadataStatus : null
    const reviewableStatus = input.source_bot === 'devspace_outreach' ? null : requestedStatus
    const isEmailOutreachLead = isEmailOutreachSourceBot(input.source_bot)
    const leadStatus = isEmailOutreachLead ? reviewableStatus ?? 'drafted' : 'new'
    const outreachTargetDomain = normalizeDomain(input.metadata?.domain as string | undefined)
    const emailApprovalState =
      isEmailOutreachLead
        ? reviewableStatus === 'approved' ||
          reviewableStatus === 'sent' ||
          reviewableStatus === 'rejected'
          ? reviewableStatus
          : reviewableStatus === 'responded' ||
              reviewableStatus === 'positive' ||
              reviewableStatus === 'negative' ||
              reviewableStatus === 'offer_received'
            ? 'responded'
          : 'drafted'
        : null
    const domainLifecycleState =
      input.source_bot === 'afternic_sync'
        ? 'listed'
        : input.source_bot === 'domain_merchant'
          ? 'candidate'
          : null
    const normalizedPayload = {
      ...body,
      company: {
        ...body.company,
        domain: normalizedDomain,
      },
      contact: body.contact || normalizedEmail
        ? {
            ...(body.contact ?? {}),
            email: normalizedEmail,
          }
        : body.contact,
      metadata: {
        ...(body.metadata ?? {}),
        niche: serviceConfig?.niche ?? requestedNiche ?? body.metadata?.niche,
        domain: isEmailOutreachLead ? outreachTargetDomain ?? normalizedDomain : normalizedDomain,
        company_domain: normalizedDomain,
        contact_email: normalizedEmail,
        outreach_status: isEmailOutreachLead ? leadStatus : body.metadata?.outreach_status,
        email_approval_state: emailApprovalState,
        domain_lifecycle_state: domainLifecycleState,
      },
    }

    let company = await findExistingCompany(input)

    if (!company) {
      const { data, error } = await supabaseAdmin
        .from('companies')
        .insert({
          organization_id: organizationId,
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

    if (input.contact || normalizedEmail) {
      contact = await findExistingContact(input, company.id)

      if (!contact) {
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .insert({
            organization_id: organizationId,
            company_id: company.id,
            name: input.contact?.name ?? null,
            email: normalizedEmail,
            phone: input.contact?.phone ?? null,
            title: input.contact?.title ?? null,
            linkedin_url: input.contact?.linkedin_url ?? null,
          })
          .select()
          .single()

        if (error) throw error
        contact = data
      } else if (!contact.email && normalizedEmail) {
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .update({
            email: normalizedEmail,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contact.id)
          .select()
          .single()

        if (error) throw error
        contact = data
      }
    }

    const existingLead = await findExistingLead(input, company.id)

    if (existingLead) {
      const shouldPreserveApprovalState =
        isEmailOutreachLead &&
        !reviewableStatus &&
        existingLead.email_approval_state &&
        existingLead.email_approval_state !== 'drafted'
      const nextEmailApprovalState = shouldPreserveApprovalState
        ? existingLead.email_approval_state
        : emailApprovalState ?? existingLead.email_approval_state ?? null
      const updatedStatus =
        isEmailOutreachLead && reviewableStatus
          ? reviewableStatus
          : shouldPreserveApprovalState
            ? existingLead.status
            : isEmailOutreachLead
              ? 'drafted'
              : existingLead.status
      const updatedPayload = shouldPreserveApprovalState
        ? {
            ...normalizedPayload,
            metadata: {
              ...normalizedPayload.metadata,
              outreach_status: updatedStatus,
              email_approval_state: nextEmailApprovalState,
            },
          }
        : normalizedPayload

      const { data, error } = await supabaseAdmin
        .from('leads')
        .update({
          organization_id: organizationId,
          contact_id: contact?.id ?? existingLead.contact_id,
          score: input.lead.score,
          status: updatedStatus,
          email_approval_state: nextEmailApprovalState,
          domain_lifecycle_state: domainLifecycleState ?? existingLead.domain_lifecycle_state ?? null,
          summary: input.lead.summary ?? existingLead.summary,
          pain_points: input.lead.pain_points,
          raw_payload: updatedPayload,
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
        organization_id: input.organization_id ?? null,
        company_id: company.id,
        contact_id: contact?.id ?? null,
        source_bot: input.source_bot,
        lead_type: input.lead.lead_type,
        status: leadStatus,
        email_approval_state: emailApprovalState,
        domain_lifecycle_state: domainLifecycleState,
        score: input.lead.score,
        summary: input.lead.summary ?? null,
        pain_points: input.lead.pain_points,
        raw_payload: normalizedPayload,
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
