import { Check, Send, Trash2, X } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireDomainPortfolioOwner } from '../../../lib/auth'
import { logActivity } from '../../../lib/activity'
import { buildDomainPerformance } from '../../../lib/domain-performance'
import { domainFromLead, metadataValue } from '../../../lib/domain-intelligence'
import { sendOutreachEmail } from '../../../lib/smtp'
import { normalizeDomain, normalizeEmail } from '../../../lib/utils'
import {
  mergeLeadMetadata,
  outreachBody,
  outreachDomain,
  outreachEmail,
  outreachStatuses,
  outreachStatus,
  outreachSubject,
  scoreReasons,
} from '../../../lib/outreach'
import { supabaseAdmin } from '../../../lib/supabase-admin'

type TabKey = 'portfolio' | 'recommendations' | 'outreach' | 'sales' | 'signals' | 'sent'

type LeadRecord = {
  id: string
  organization_id: string | null
  status: string | null
  score: number | null
  source_bot: string | null
  lead_type: string | null
  summary: string | null
  raw_payload: any
  created_at: string
  updated_at?: string | null
  email_approval_state?: string | null
  domain_lifecycle_state?: string | null
  organizations?: { name: string }[] | { name: string } | null
  companies?: { name: string; domain: string | null; website: string | null }[] | {
    name: string
    domain: string | null
    website: string | null
  } | null
  contacts?: {
    name: string | null
    email: string | null
    title: string | null
  }[] | {
    name: string | null
    email: string | null
    title: string | null
  } | null
}

type SaleRecord = {
  id: string
  lead_id: string | null
  customer_name: string | null
  lead_source: string | null
  service_sold: string | null
  deal_value: number | string | null
  status: string | null
  notes: string | null
  closed_at: string | null
  created_at: string
  domain_name?: string | null
  raw_payload?: any
  purchase_price?: number | string | null
  gross_profit?: number | string | null
}

type ServiceRecord = {
  id: string
  organization_id: string
  service_key: string
  is_enabled: boolean
  email_enabled: boolean
  approval_required: boolean
  daily_limit: number
  config_json: Record<string, unknown>
  organizations: { name: string }[] | { name: string } | null
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'sales', label: 'Sales / Afternic' },
  { key: 'signals', label: 'Signals' },
  { key: 'sent', label: 'Sent' },
]

const domainPortfolioSourceBots = ['domain_merchant', 'apollo_outreach', 'afternic_sync', 'domain'] as const
const domainPortfolioOutreachLeadTypes = ['domain_outreach', 'domain_buyer_outreach', 'buyer_outreach'] as const

function activeTab(value: string | undefined): TabKey {
  return tabs.some((tab) => tab.key === value) ? (value as TabKey) : 'portfolio'
}

function firstRelation<T>(value: T[] | T | null | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function formatMoney(value: number | string | null | undefined) {
  if (value == null || value === '') return 'n/a'
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return 'n/a'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numericValue)
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'n/a'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function metadataString(lead: LeadRecord, key: string) {
  const value = metadataValue(lead.raw_payload, key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function metadataNumber(lead: LeadRecord, key: string) {
  const value = metadataValue(lead.raw_payload, key)
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function outreachContactName(lead: LeadRecord) {
  const payloadContact = lead.raw_payload?.contact
  const payloadName = [payloadContact?.first_name, payloadContact?.last_name].filter(Boolean).join(' ').trim()
  return payloadContact?.name || payloadName || null
}

function isOutreachReviewStatus(value: string | null | undefined) {
  return outreachStatuses.includes(String(value ?? '').toLowerCase() as (typeof outreachStatuses)[number])
}

function displayOutreachStatus(lead: LeadRecord) {
  const status = outreachStatus(lead)
  if (isOutreachReviewStatus(status)) return status
  return lead.email_approval_state ?? status
}

function isDomainPortfolioOutreachLead(lead: LeadRecord) {
  if (lead.source_bot === 'apollo_outreach') return true
  return domainPortfolioOutreachLeadTypes.includes(lead.lead_type as (typeof domainPortfolioOutreachLeadTypes)[number])
}

function hasOutreachDraftContent(lead: LeadRecord) {
  return Boolean(outreachSubject(lead) || outreachBody(lead) || outreachEmail(lead))
}

function shouldShowInOutreachTab(lead: LeadRecord) {
  if (lead.source_bot === 'apollo_outreach') return true
  return isOutreachReviewStatus(displayOutreachStatus(lead)) || hasOutreachDraftContent(lead)
}

function dedupeOutreachLeads(leads: LeadRecord[]) {
  const seen = new Set<string>()
  const completedStatuses = new Set(['approved', 'sent', 'responded', 'positive', 'negative', 'bounced', 'unsubscribed', 'offer_received'])
  const ordered = [...leads].sort((left, right) => {
    const statusDifference = Number(completedStatuses.has(displayOutreachStatus(right))) - Number(completedStatuses.has(displayOutreachStatus(left)))
    if (statusDifference !== 0) return statusDifference
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })

  return ordered.filter((lead) => {
    const email = normalizeEmail(outreachEmail(lead))
    const domain = normalizeDomain(outreachDomain(lead))
    const subject = outreachSubject(lead).toLowerCase()
    const body = outreachBody(lead).replace(/\s+/g, ' ').trim().toLowerCase()

    // Only collapse exact copies. Different messages to the same recipient
    // remain visible because they may be legitimate follow-ups.
    if (!email || (!subject && !body)) return true
    const key = [lead.organization_id ?? '', email, domain ?? '', subject, body].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function outreachServiceLimitLabel(service: ServiceRecord) {
  return service.service_key === 'apollo_outreach' ? 'No daily cap' : `Daily limit ${service.daily_limit}`
}

async function updateOutreach(formData: FormData) {
  'use server'

  await requireDomainPortfolioOwner()

  const leadId = String(formData.get('lead_id') ?? '')
  const action = String(formData.get('action') ?? '')
  const subject = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  const nextStatus =
    action === 'reject'
        ? 'rejected'
        : action === 'save'
          ? null
          : null

  if (!leadId || (!nextStatus && action !== 'save' && action !== 'approve')) return

  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('id, organization_id, source_bot, raw_payload, status, contacts (email), companies (name, domain)')
    .eq('id', leadId)
    .single()

  if (leadError) {
    redirect(`/admin/domain-portfolio?tab=outreach&error=${encodeURIComponent(leadError.message)}`)
  }

  if (action === 'approve') {
    const contact = firstRelation(lead.contacts as { email: string | null }[] | { email: string | null } | null)
    const company = firstRelation(lead.companies as { name: string; domain: string | null }[] | { name: string; domain: string | null } | null)
    const toEmail = normalizeEmail(contact?.email ?? outreachEmail(lead))

    if (!toEmail || !subject || !body) {
      redirect('/admin/domain-portfolio?tab=outreach&error=Recipient%20email%2C%20subject%2C%20and%20email%20body%20are%20required%20before%20sending.')
    }

    const sendingPayload = mergeLeadMetadata(lead, {
      crm_email_subject: subject,
      crm_email_body: body,
      outreach_status: 'sending',
      crm_review_note: note || null,
    })
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('leads')
      .update({ status: 'sending', raw_payload: sendingPayload, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('status', lead.status)
      .neq('status', 'sent')
      .select('id')
      .maybeSingle()

    if (claimError) {
      redirect(`/admin/domain-portfolio?tab=outreach&error=${encodeURIComponent(claimError.message)}`)
    }
    if (!claimed) {
      redirect('/admin/domain-portfolio?tab=outreach&error=This%20email%20is%20already%20being%20sent%20or%20has%20already%20been%20sent.')
    }

    let delivery
    try {
      delivery = await sendOutreachEmail({ to: toEmail, subject, body })
    } catch (error) {
      await supabaseAdmin.from('leads').update({
        status: lead.status,
        raw_payload: mergeLeadMetadata({ raw_payload: sendingPayload }, { outreach_status: lead.status }),
        updated_at: new Date().toISOString(),
      }).eq('id', leadId).eq('status', 'sending')
      const message = error instanceof Error ? error.message : 'The email provider rejected the send request.'
      redirect(`/admin/domain-portfolio?tab=outreach&error=${encodeURIComponent(message)}`)
    }

    // SMTP has accepted the message at this point. Never return it to the draft
    // queue after this boundary, because a retry could send a duplicate.
    const sentAt = new Date().toISOString()
    const sentPayload = mergeLeadMetadata({ raw_payload: sendingPayload }, {
        outreach_status: 'sent',
        sent_at: sentAt,
        message_id: delivery.messageId,
        provider: delivery.provider,
        sending_account: delivery.fromEmail,
        to_email: toEmail,
        sent_subject: subject,
        outreach_source: lead.source_bot === 'apollo_outreach' ? 'Apollo Outreach' : 'manual',
    })

    const { error: sentError } = await supabaseAdmin.from('leads').update({
        status: 'sent',
        email_approval_state: 'sent',
        raw_payload: sentPayload,
        updated_at: sentAt,
    }).eq('id', leadId).eq('status', 'sending')
    if (sentError) {
      // SMTP has already accepted this message. Keep the record claimed so a
      // retry cannot send a duplicate, and surface the persistence problem.
      redirect(`/admin/domain-portfolio?tab=outreach&error=${encodeURIComponent(`Email accepted by SMTP, but the sent record could not be saved: ${sentError.message}`)}`)
    }

    const suppressionPayload = {
        organization_id: lead.organization_id,
        email: toEmail,
        company_domain: normalizeDomain(company?.domain ?? outreachDomain(lead)),
        company_name: company?.name ?? null,
        reason: 'already_contacted',
        source: delivery.provider,
        last_contacted_at: sentAt,
        updated_at: sentAt,
    }
    const { data: existingSuppression } = await supabaseAdmin
      .from('outreach_suppressions')
      .select('id')
      .eq('organization_id', lead.organization_id)
      .eq('email', toEmail)
      .maybeSingle()

    if (existingSuppression) {
      await supabaseAdmin.from('outreach_suppressions')
        .update(suppressionPayload)
        .eq('id', existingSuppression.id)
    } else {
      await supabaseAdmin.from('outreach_suppressions').insert(suppressionPayload)
    }

    await logActivity(leadId, 'outreach_sent', {
        to_email: toEmail,
        subject,
        sent_at: sentAt,
        message_id: delivery.messageId,
        provider: delivery.provider,
        sending_account: delivery.fromEmail,
    })

    revalidatePath('/admin/domain-portfolio')
    redirect('/admin/domain-portfolio?tab=sent&notice=Email%20sent%20successfully.')
  }

  const metadata: Record<string, unknown> = {}
  if (subject) metadata.crm_email_subject = subject
  if (body) metadata.crm_email_body = body
  if (nextStatus) metadata.outreach_status = nextStatus
  if (note) metadata.crm_review_note = note

  const updatePayload: Record<string, unknown> = {
    status: nextStatus ?? lead.status,
    raw_payload: mergeLeadMetadata(lead, metadata),
    updated_at: new Date().toISOString(),
  }

  if (nextStatus) {
    updatePayload.email_approval_state = nextStatus
  }

  const { error } = await supabaseAdmin.from('leads').update(updatePayload).eq('id', leadId)
  if (error) throw error

  await logActivity(leadId, action === 'save' ? 'outreach_draft_edited' : 'outreach_reviewed', {
    action,
    status: nextStatus,
    note: note || null,
  })

  revalidatePath('/admin/domain-portfolio')
}

async function deleteSentOutreach(formData: FormData) {
  'use server'

  await requireDomainPortfolioOwner()

  const leadId = String(formData.get('lead_id') ?? '')
  if (!leadId) return

  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('id, status, email_approval_state, raw_payload')
    .eq('id', leadId)
    .single()

  if (leadError) throw leadError
  if (displayOutreachStatus(lead as LeadRecord) !== 'sent') return

  // The outreach suppression created at send time is deliberately retained.
  const { error } = await supabaseAdmin.from('leads').delete().eq('id', leadId)
  if (error) throw error

  revalidatePath('/admin/domain-portfolio')
}

export default async function DomainPortfolioPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; error?: string; notice?: string }>
}) {
  await requireDomainPortfolioOwner()

  const params = await searchParams
  const tab = activeTab(params?.tab)

  const [leadsResult, salesResult, servicesResult] = await Promise.all([
    supabaseAdmin
      .from('leads')
      .select(`
        id,
        organization_id,
        status,
        score,
        source_bot,
        lead_type,
        summary,
        raw_payload,
        created_at,
        updated_at,
        email_approval_state,
        domain_lifecycle_state,
        organizations (name),
        companies (name, domain, website),
        contacts (name, email, title)
      `)
      .in('source_bot', [...domainPortfolioSourceBots])
      .order('created_at', { ascending: false })
      .limit(3000),
    supabaseAdmin
      .from('sales_records')
      .select('id, lead_id, customer_name, lead_source, service_sold, deal_value, status, notes, closed_at, created_at, domain_name, raw_payload, purchase_price, gross_profit')
      .order('created_at', { ascending: false })
      .limit(3000),
    supabaseAdmin
      .from('organization_services')
      .select(`
        id,
        organization_id,
        service_key,
        is_enabled,
        email_enabled,
        approval_required,
        daily_limit,
        config_json,
        organizations (name)
      `)
      .in('service_key', ['domain_merchant', 'apollo_outreach', 'afternic_sync'])
      .order('updated_at', { ascending: false }),
  ])

  const leads = (leadsResult.data ?? []) as unknown as LeadRecord[]
  const sales = (salesResult.data ?? []) as unknown as SaleRecord[]
  const services = (servicesResult.data ?? []) as unknown as ServiceRecord[]
  const rows = buildDomainPerformance(leads as any[], sales as any[])
  const domainMerchantLeads = leads.filter((lead) => lead.source_bot === 'domain_merchant')
  const outreachLeads = dedupeOutreachLeads(
    leads
      .filter(isDomainPortfolioOutreachLead)
      .filter(shouldShowInOutreachTab),
  )
  const reviewLeads = outreachLeads.filter((lead) =>
    !['approved', 'sent', 'responded', 'positive', 'negative', 'bounced', 'unsubscribed', 'offer_received']
      .includes(displayOutreachStatus(lead)),
  )
  const sentLeads = outreachLeads.filter((lead) =>
    ['approved', 'sent', 'responded', 'positive', 'negative', 'bounced', 'unsubscribed', 'offer_received']
      .includes(displayOutreachStatus(lead)),
  )
  const afternicSales = sales.filter((sale) => sale.lead_source === 'afternic_sync' || sale.domain_name)
  const sentCount = outreachLeads.filter((lead) => displayOutreachStatus(lead) === 'sent').length
  const responseCount = outreachLeads.filter((lead) =>
    ['responded', 'positive', 'negative', 'offer_received'].includes(displayOutreachStatus(lead)),
  ).length
  const totalProfit = rows.reduce((sum, row) => sum + Number(row.gross_profit ?? 0), 0)
  const responseRate = sentCount > 0 ? Math.round((responseCount / sentCount) * 100) : 0

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Domain Portfolio</h1>
          <p className="page-subtitle">
            Portfolio, recommendations, outreach, Afternic sales, and buying signals in one owner-only workspace.
          </p>
        </div>
      </div>

      {leadsResult.error || salesResult.error || servicesResult.error ? (
        <div className="panel border-red-300/40 bg-red-950/40 text-red-100">
          <h2 className="m-0 text-lg font-bold">Domain portfolio could not be loaded</h2>
          <p className="mt-2 text-sm">
            {leadsResult.error?.message ?? salesResult.error?.message ?? servicesResult.error?.message}
          </p>
        </div>
      ) : null}

      {params?.error ? (
        <div className="panel border-red-300/40 bg-red-950/40 text-red-100" role="alert">
          <strong>Email was not sent.</strong> {params.error}
        </div>
      ) : null}
      {params?.notice ? (
        <div className="panel border-emerald-300/40 bg-emerald-950/40 text-emerald-100" role="status">
          {params.notice}
        </div>
      ) : null}

      <section className="card-grid">
        <div className="card">
          <div className="card-label">Domains</div>
          <div className="card-value">{rows.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Outreach Response Rate</div>
          <div className="card-value">{responseRate}%</div>
        </div>
        <div className="card">
          <div className="card-label">Gross Profit</div>
          <div className="card-value">{formatMoney(totalProfit)}</div>
        </div>
      </section>

      {tab === 'portfolio' ? <PortfolioTab rows={rows} /> : null}
      {tab === 'recommendations' ? <RecommendationsTab leads={domainMerchantLeads} /> : null}
      {tab === 'outreach' ? (
        <OutreachTab leads={reviewLeads} services={services.filter((service) => service.service_key === 'apollo_outreach')} />
      ) : null}
      {tab === 'sales' ? <SalesTab sales={afternicSales} /> : null}
      {tab === 'signals' ? <SignalsTab rows={rows} leads={leads} services={services} /> : null}
      {tab === 'sent' ? <SentTab leads={sentLeads} /> : null}
    </div>
  )
}

function PortfolioTab({ rows }: { rows: ReturnType<typeof buildDomainPerformance> }) {
  return (
    <section className="panel">
      <div className="mb-5">
        <h2 className="m-0 text-xl font-bold">Portfolio</h2>
        <p className="page-subtitle">Every domain grouped with recommendation, outreach, and sales performance.</p>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 ? (
          <div className="empty-state">No domain portfolio data has been ingested yet.</div>
        ) : (
          rows.map((row) => (
            <article key={row.domain} className="data-row p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 break-all text-lg font-bold text-white">{row.domain}</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {row.niche ?? 'No niche'} · {row.category ?? 'No category'}
                  </p>
                </div>
                <span className="status-pill">{row.domain_lifecycle_state ?? row.status ?? 'unknown'}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                <Metric label="Score" value={row.resale_likelihood_score ?? 'n/a'} />
                <Metric label="Ask" value={formatMoney(row.ask_price)} />
                <Metric label="Target" value={formatMoney(row.target_price)} />
                <Metric label="Sale" value={formatMoney(row.sale_price)} />
                <Metric label="Cost" value={formatMoney(row.purchase_price)} />
                <Metric label="Profit" value={formatMoney(row.gross_profit)} />
                <Metric label="Sent" value={row.sent} />
                <Metric label="Replies" value={row.replies} />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <TermList label="Buyer terms" terms={row.buyer_terms} />
                <TermList label="Action terms" terms={row.action_terms} />
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function RecommendationsTab({ leads }: { leads: LeadRecord[] }) {
  return (
    <section className="panel">
      <div className="mb-5">
        <h2 className="m-0 text-xl font-bold">Domain Merchant Recommendations</h2>
        <p className="page-subtitle">Domains sent by domain_merchant, sorted newest first.</p>
      </div>

      <div className="grid gap-3">
        {leads.length === 0 ? (
          <div className="empty-state">No domain_merchant recommendations have been ingested yet.</div>
        ) : (
          leads.map((lead) => (
            <article key={lead.id} className="data-row p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 break-all text-lg font-bold text-white">
                    {domainFromLead(lead) ?? 'Unknown domain'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">{lead.summary ?? 'No summary included.'}</p>
                </div>
                <span className="status-pill">{lead.status ?? 'new'}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric label="Score" value={lead.score ?? 'n/a'} />
                <Metric label="Ask" value={formatMoney(metadataNumber(lead, 'ask_price') ?? metadataNumber(lead, 'price'))} />
                <Metric label="Target" value={formatMoney(metadataNumber(lead, 'target_price'))} />
                <Metric label="Niche" value={metadataString(lead, 'niche') ?? 'n/a'} />
                <Metric label="Received" value={formatDate(lead.created_at)} />
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function OutreachTab({ leads, services }: { leads: LeadRecord[]; services: ServiceRecord[] }) {
  const draftedCount = leads.filter((lead) => displayOutreachStatus(lead) === 'drafted').length
  const approvedCount = leads.filter((lead) => displayOutreachStatus(lead) === 'approved').length
  const sentCount = leads.filter((lead) => displayOutreachStatus(lead) === 'sent').length
  const responseCount = leads.filter((lead) =>
    ['responded', 'positive', 'negative', 'offer_received'].includes(displayOutreachStatus(lead)),
  ).length
  const responseRate = sentCount > 0 ? Math.round((responseCount / sentCount) * 100) : 0

  return (
    <>
      <section className="card-grid">
        <div className="card">
          <div className="card-label">Drafts</div>
          <div className="card-value">{draftedCount}</div>
        </div>
        <div className="card">
          <div className="card-label">Approved Queue</div>
          <div className="card-value">{approvedCount}</div>
        </div>
        <div className="card">
          <div className="card-label">Response Rate</div>
          <div className="card-value">{responseRate}%</div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-bold">Service Status</h2>
            <p className="page-subtitle">Outreach configuration and sending status.</p>
          </div>
          <span className="status-pill">
            <Send className="mr-2 h-3.5 w-3.5" />
            Sent {sentCount}
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {services.length === 0 ? (
            <div className="empty-state">No outreach service records are configured yet.</div>
          ) : (
            services.map((service) => {
              const organization = firstRelation(service.organizations)
              return (
                <div key={service.id} className="data-row p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{organization?.name ?? service.organization_id}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {outreachServiceLimitLabel(service)} · Approval {service.approval_required ? 'required' : 'optional'}
                      </div>
                    </div>
                    <span className="status-pill">{service.is_enabled ? 'enabled' : 'disabled'}</span>
                  </div>
                  <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                    {JSON.stringify(service.config_json ?? {}, null, 2)}
                  </pre>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="panel">
        <div className="mb-5">
          <h2 className="m-0 text-xl font-bold">Emails and Responses</h2>
          <p className="page-subtitle">Generated emails plus their approval, sent, and response state.</p>
        </div>

        <div className="grid gap-4">
          {leads.length === 0 ? (
            <div className="empty-state">No outreach emails have been ingested yet.</div>
          ) : (
            leads.map((lead) => {
              const company = firstRelation(lead.companies)
              const contact = firstRelation(lead.contacts)
              const reasons = scoreReasons(lead)
              const status = displayOutreachStatus(lead)
              const email = contact?.email ?? outreachEmail(lead)

              return (
                <article key={lead.id} className="data-row p-4">
                  <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="m-0 text-lg font-bold text-white">{contact?.name ?? 'Unknown prospect'}</h3>
                          <p className="mt-1 text-sm text-slate-300">
                            {contact?.title ?? 'No title'} · {company?.name ?? 'Unknown company'}
                          </p>
                        </div>
                        <span className="status-pill">{status || lead.status}</span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Metric label="Email" value={email ?? 'No email'} />
                        <Metric label="Domain" value={outreachDomain(lead) || 'No domain'} />
                        <Metric label="Score" value={lead.score ?? 'n/a'} />
                        <Metric label="Updated" value={formatDate(lead.updated_at ?? lead.created_at)} />
                      </div>

                      <div className="mt-4">
                        <div className="text-xs font-semibold uppercase text-slate-500">Score Reasons</div>
                        {reasons.length > 0 ? (
                          <ul className="mt-2 space-y-1 pl-4 text-sm text-slate-200">
                            {reasons.map((reason, index) => (
                              <li key={`${lead.id}-${index}`}>{reason}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-slate-300">No score reasons were included.</p>
                        )}
                      </div>
                    </div>

                    <form action={updateOutreach} className="grid gap-3">
                      <input type="hidden" name="lead_id" value={lead.id} />
                      <label className="grid gap-2 text-sm font-bold text-slate-200">
                        Subject
                        <input name="subject" defaultValue={outreachSubject(lead)} className="login-input min-h-0 py-2 text-sm" />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-slate-200">
                        Email Body
                        <textarea
                          name="body"
                          defaultValue={outreachBody(lead)}
                          rows={9}
                          className="login-input min-h-0 resize-y py-2 text-sm leading-6"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-slate-200">
                        Review Note
                        <input name="note" className="login-input min-h-0 py-2 text-sm" placeholder="Optional internal note" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button name="action" value="save" className="button" type="submit">
                          Save
                        </button>
                        <button name="action" value="approve" className="button" type="submit">
                          <Check className="mr-2 inline h-4 w-4" />
                          Approve &amp; Send
                        </button>
                        <button name="action" value="reject" className="button border-red-300/40 bg-red-950/40 text-red-100" type="submit">
                          <X className="mr-2 inline h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    </form>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>
    </>
  )
}

function SentTab({ leads }: { leads: LeadRecord[] }) {
  return (
    <section className="panel">
      <div className="mb-5">
        <h2 className="m-0 text-xl font-bold">Sent Outreach</h2>
        <p className="page-subtitle">Sent messages and their latest delivery or response status.</p>
      </div>
      {leads.length === 0 ? <div className="empty-state">No sent outreach yet.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase text-slate-400">
              <tr>{['Sent date', 'Domain', 'Company', 'Contact', 'Email address', 'Subject', 'Status', 'Source', 'Provider', 'Action'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const company = firstRelation(lead.companies)
                const contact = firstRelation(lead.contacts)
                const sentAt = metadataString(lead, 'sent_at') ?? lead.updated_at ?? lead.created_at
                const status = displayOutreachStatus(lead) === 'approved' ? 'sent' : displayOutreachStatus(lead)
                return (
                  <tr key={lead.id} className="border-b border-white/10 align-top text-slate-200">
                    <td className="p-3 whitespace-nowrap">{formatDate(sentAt)}</td>
                    <td className="p-3">{outreachDomain(lead) || 'n/a'}</td>
                    <td className="p-3">{company?.name ?? 'n/a'}</td>
                    <td className="p-3">{contact?.name ?? outreachContactName(lead) ?? 'n/a'}</td>
                    <td className="p-3">{contact?.email ?? outreachEmail(lead) ?? 'n/a'}</td>
                    <td className="p-3">{outreachSubject(lead) || 'n/a'}</td>
                    <td className="p-3"><span className="status-pill">{status}</span></td>
                    <td className="p-3">{metadataString(lead, 'outreach_source') ?? (lead.source_bot === 'apollo_outreach' ? 'Apollo Outreach' : 'manual')}</td>
                    <td className="p-3">{metadataString(lead, 'provider') ?? (displayOutreachStatus(lead) === 'approved' ? 'Manual / historical' : 'n/a')}</td>
                    <td className="p-3">
                      <details>
                        <summary className="cursor-pointer font-semibold text-cyan-300">View full record</summary>
                        <div className="mt-3 w-80 space-y-3 rounded border border-white/10 bg-slate-950/70 p-3">
                          <div><strong>Subject:</strong> {outreachSubject(lead)}</div>
                          <div className="whitespace-pre-wrap"><strong>Body:</strong>{'\n'}{outreachBody(lead)}</div>
                          <div><strong>Message ID:</strong> {metadataString(lead, 'message_id') ?? 'n/a'}</div>
                          <form action={deleteSentOutreach}>
                            <input type="hidden" name="lead_id" value={lead.id} />
                            <button className="button border-red-300/40 bg-red-950/40 text-red-100" type="submit"><Trash2 className="mr-2 inline h-4 w-4" />Delete from list</button>
                          </form>
                        </div>
                      </details>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SalesTab({ sales }: { sales: SaleRecord[] }) {
  return (
    <section className="panel">
      <div className="mb-5">
        <h2 className="m-0 text-xl font-bold">Sales / Afternic</h2>
        <p className="page-subtitle">Sales records received from afternic_sync and domain-linked sales data.</p>
      </div>

      <div className="grid gap-3">
        {sales.length === 0 ? (
          <div className="empty-state">No Afternic sales data has been ingested yet.</div>
        ) : (
          sales.map((sale) => (
            <article key={sale.id} className="data-row p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 break-all text-lg font-bold text-white">
                    {sale.domain_name ?? sale.service_sold ?? 'Unknown domain'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">{sale.customer_name ?? 'No customer'} · {sale.notes ?? 'No notes'}</p>
                </div>
                <span className="status-pill">{sale.status ?? 'unknown'}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric label="Sale" value={formatMoney(sale.deal_value)} />
                <Metric label="Cost" value={formatMoney(sale.purchase_price)} />
                <Metric label="Profit" value={formatMoney(sale.gross_profit)} />
                <Metric label="Closed" value={formatDate(sale.closed_at)} />
                <Metric label="Source" value={sale.lead_source ?? 'n/a'} />
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function SignalsTab({
  rows,
  leads,
  services,
}: {
  rows: ReturnType<typeof buildDomainPerformance>
  leads: LeadRecord[]
  services: ServiceRecord[]
}) {
  const highScore = rows.filter((row) => Number(row.resale_likelihood_score ?? 0) >= 70)
  const needsOutreach = rows.filter((row) => row.outreach_count === 0 && row.domain_lifecycle_state !== 'sold')
  const positiveReplies = rows.filter((row) => row.positive_responses > 0)
  const soldProfitable = rows.filter((row) => row.domain_lifecycle_state === 'sold' && Number(row.gross_profit ?? 0) > 0)
  const domainMerchantServices = services.filter((service) => service.service_key === 'domain_merchant')

  return (
    <>
      <section className="card-grid">
        <div className="card">
          <div className="card-label">High Score</div>
          <div className="card-value">{highScore.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Needs Outreach</div>
          <div className="card-value">{needsOutreach.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Positive Replies</div>
          <div className="card-value">{positiveReplies.length}</div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-5">
          <h2 className="m-0 text-xl font-bold">Buying Signals</h2>
          <p className="page-subtitle">Signals that should influence which domains to buy, list, or push through outreach.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <SignalList title="Best domains to buy" rows={highScore} />
          <SignalList title="Needs outreach" rows={needsOutreach} />
          <SignalList title="Positive buyer replies" rows={positiveReplies} />
          <SignalList title="Sold/profitable" rows={soldProfitable} />
        </div>
      </section>

      <section className="panel">
        <div className="mb-5">
          <h2 className="m-0 text-xl font-bold">Service Signals</h2>
          <p className="page-subtitle">Domain Merchant configuration and recent domain bot volume.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {domainMerchantServices.map((service) => {
            const organization = firstRelation(service.organizations)
            return (
              <div key={service.id} className="data-row p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-white">{organization?.name ?? service.organization_id}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Daily limit {service.daily_limit} · {service.email_enabled ? 'Email enabled' : 'Email disabled'}
                    </div>
                  </div>
                  <span className="status-pill">{service.is_enabled ? 'enabled' : 'disabled'}</span>
                </div>
                <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                  {JSON.stringify(service.config_json ?? {}, null, 2)}
                </pre>
              </div>
            )
          })}
          <div className="data-row p-4">
            <h3 className="m-0 text-lg font-bold text-white">Recent Bot Volume</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Domain Merchant" value={leads.filter((lead) => lead.source_bot === 'domain_merchant').length} />
              <Metric label="Outreach" value={leads.filter(isDomainPortfolioOutreachLead).length} />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function SignalList({ title, rows }: { title: string; rows: ReturnType<typeof buildDomainPerformance> }) {
  return (
    <div className="data-row p-4">
      <h3 className="m-0 text-lg font-bold text-white">{title}</h3>
      <div className="mt-4 grid gap-2">
        {rows.length === 0 ? (
          <p className="m-0 text-sm text-slate-400">No domains match yet.</p>
        ) : (
          rows.slice(0, 8).map((row) => (
            <div key={`${title}-${row.domain}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="break-all font-bold text-slate-100">{row.domain}</span>
              <span className="text-slate-300">
                Score {row.resale_likelihood_score ?? 'n/a'} · Profit {formatMoney(row.gross_profit)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-slate-100">{value}</div>
    </div>
  )
}

function TermList({ label, terms }: { label: string; terms: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {terms.length === 0 ? (
          <span className="text-sm text-slate-400">None</span>
        ) : (
          terms.slice(0, 12).map((term) => (
            <span key={term} className="status-pill">
              {term}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
