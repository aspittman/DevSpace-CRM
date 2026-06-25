import { Check, Send, X } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { requireDomainPortfolioOwner } from '../../../lib/auth'
import { logActivity } from '../../../lib/activity'
import { buildDomainPerformance } from '../../../lib/domain-performance'
import { domainFromLead, metadataValue } from '../../../lib/domain-intelligence'
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

type TabKey = 'portfolio' | 'recommendations' | 'outreach' | 'sales' | 'signals'

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

async function updateOutreach(formData: FormData) {
  'use server'

  await requireDomainPortfolioOwner()

  const leadId = String(formData.get('lead_id') ?? '')
  const action = String(formData.get('action') ?? '')
  const subject = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  const nextStatus =
    action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : action === 'save'
          ? null
          : null

  if (!leadId || (!nextStatus && action !== 'save')) return

  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('id, raw_payload, status')
    .eq('id', leadId)
    .single()

  if (leadError) throw leadError

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

export default async function DomainPortfolioPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
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
  const outreachLeads = leads
    .filter(isDomainPortfolioOutreachLead)
    .filter(shouldShowInOutreachTab)
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
        <OutreachTab leads={outreachLeads} services={services.filter((service) => service.service_key === 'apollo_outreach')} />
      ) : null}
      {tab === 'sales' ? <SalesTab sales={afternicSales} /> : null}
      {tab === 'signals' ? <SignalsTab rows={rows} leads={leads} services={services} /> : null}
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
                        Daily limit {service.daily_limit} · Approval {service.approval_required ? 'required' : 'optional'}
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
                          Approve
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
