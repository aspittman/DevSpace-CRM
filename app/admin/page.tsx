import { supabaseAdmin } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/auth'
import LogoutButton from '../../components/layout/logout-button'
import { revalidatePath } from 'next/cache'
import { logActivity } from '../../lib/activity'
import {
  leadMetadata,
  mergeLeadMetadata,
  outreachBody,
  outreachDomain,
  outreachStatus,
  outreachSubject,
  scoreReasons,
} from '../../lib/outreach'

type OutreachLeadRecord = {
  id: string
  organization_id: string
  status: string
  score: number
  summary: string | null
  pain_points: unknown
  raw_payload: unknown
  created_at: string
  updated_at: string
  email_approval_state: string | null
  organizations: { name: string }[] | { name: string } | null
  companies:
    | {
        name: string
        domain: string | null
        website: string | null
        industry: string | null
        city: string | null
        state: string | null
      }[]
    | {
        name: string
        domain: string | null
        website: string | null
        industry: string | null
        city: string | null
        state: string | null
      }
    | null
  contacts:
    | {
        name: string | null
        email: string | null
        phone: string | null
        title: string | null
      }[]
    | {
        name: string | null
        email: string | null
        phone: string | null
        title: string | null
      }
    | null
}

function firstRelation<T>(value: T[] | T | null | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function metadataList(lead: OutreachLeadRecord, keys: string[]) {
  const metadata = leadMetadata(lead)

  for (const key of keys) {
    const value = metadata[key]
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
    if (typeof value === 'string' && value.trim()) return [value.trim()]
  }

  return []
}

function metadataText(lead: OutreachLeadRecord, keys: string[]) {
  const metadata = leadMetadata(lead)

  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }

  return null
}

function listFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

async function updateDevspaceOutreach(formData: FormData) {
  'use server'

  await requireAdmin()

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
    .select('id, source_bot, raw_payload, status')
    .eq('id', leadId)
    .single()

  if (leadError) throw leadError
  if (lead.source_bot !== 'devspace_outreach') return

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
    source_bot: 'devspace_outreach',
    action,
    status: nextStatus,
    note: note || null,
  })

  revalidatePath('/admin')
}

export default async function AdminDashboardPage() {
  await requireAdmin()

  const [
    { count: leadCount },
    { count: companyCount },
    { count: botRunCount },
    { count: pendingDevspaceOutreachCount },
    { count: approvedDevspaceOutreachCount },
    { count: sentDevspaceOutreachCount },
    outreachResult,
  ] =
    await Promise.all([
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('companies').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('bot_runs').select('*', { count: 'exact', head: true }),
      supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('source_bot', 'devspace_outreach')
        .eq('email_approval_state', 'drafted'),
      supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('source_bot', 'devspace_outreach')
        .eq('email_approval_state', 'approved'),
      supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('source_bot', 'devspace_outreach')
        .eq('email_approval_state', 'sent'),
      supabaseAdmin
        .from('leads')
        .select(`
          id,
          organization_id,
          status,
          score,
          summary,
          pain_points,
          raw_payload,
          created_at,
          updated_at,
          email_approval_state,
          organizations (name),
          companies (name, domain, website, industry, city, state),
          contacts (name, email, phone, title)
        `)
        .eq('source_bot', 'devspace_outreach')
        .order('updated_at', { ascending: false })
        .limit(25),
    ])

  if (outreachResult.error) throw outreachResult.error

  const outreachLeads = (outreachResult.data ?? []) as OutreachLeadRecord[]

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">DevSpace Admin</h1>
          <p className="page-subtitle">
            Monitor customers, bot activity, lead flow, and sales intelligence.
          </p>
        </div>

        <LogoutButton />
      </div>

      <section className="card-grid">
        <div className="card">
          <div className="card-label">Total Leads</div>
          <div className="card-value">{leadCount ?? 0}</div>
        </div>

        <div className="card">
          <div className="card-label">Companies</div>
          <div className="card-value">{companyCount ?? 0}</div>
        </div>

        <div className="card">
          <div className="card-label">Bot Runs</div>
          <div className="card-value">{botRunCount ?? 0}</div>
        </div>
      </section>

      <section className="card-grid">
        <div className="card">
          <div className="card-label">DevSpace Outreach Drafts</div>
          <div className="card-value">{pendingDevspaceOutreachCount ?? 0}</div>
        </div>

        <div className="card">
          <div className="card-label">Approved To Send</div>
          <div className="card-value">{approvedDevspaceOutreachCount ?? 0}</div>
        </div>

        <div className="card">
          <div className="card-label">Sent Outreach</div>
          <div className="card-value">{sentDevspaceOutreachCount ?? 0}</div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-bold">DevSpace Outreach Review</h2>
            <p className="page-subtitle">
              Chiropractor website audits, Apollo email drafts, and approval state. Emails stay drafted until an admin approves them.
            </p>
          </div>
          <span className="status-pill">Approval required</span>
        </div>

        <div className="grid gap-4">
          {outreachLeads.length === 0 ? (
            <div className="empty-state">No devspace_outreach emails have been ingested yet.</div>
          ) : (
            outreachLeads.map((lead) => {
              const company = firstRelation(lead.companies)
              const contact = firstRelation(lead.contacts)
              const status = outreachStatus(lead) || lead.email_approval_state || lead.status
              const reasons = scoreReasons(lead)
              const weaknesses = metadataList(lead, [
                'weaknesses',
                'website_weaknesses',
                'seo_issues',
                'seo_weaknesses',
                'audit_findings',
              ])
              const opportunities = metadataList(lead, ['opportunities', 'recommendations', 'improvements'])
              const painPoints = listFromUnknown(lead.pain_points)
              const seoScore = metadataText(lead, ['seo_score', 'seoScore'])
              const performanceScore = metadataText(lead, ['performance_score', 'performanceScore'])
              const accessibilityScore = metadataText(lead, ['accessibility_score', 'accessibilityScore'])

              return (
                <article key={lead.id} className="data-row p-4">
                  <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="m-0 text-lg font-bold text-white">{company?.name ?? 'Unknown chiropractor'}</h3>
                          <p className="mt-1 text-sm text-slate-300">
                            {contact?.name ?? 'Unknown contact'} · {contact?.title ?? 'No title'}
                          </p>
                        </div>
                        <span className="status-pill">{status}</span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Metric label="Email" value={contact?.email ?? 'No email'} />
                        <Metric label="Website" value={(company?.website ?? outreachDomain(lead)) || 'No website'} />
                        <Metric label="Lead Score" value={lead.score ?? 'n/a'} />
                        <Metric label="Updated" value={formatDate(lead.updated_at ?? lead.created_at)} />
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <Metric label="SEO" value={seoScore ?? 'n/a'} />
                        <Metric label="Performance" value={performanceScore ?? 'n/a'} />
                        <Metric label="Accessibility" value={accessibilityScore ?? 'n/a'} />
                      </div>

                      <p className="mt-4 text-sm leading-6 text-slate-200">{lead.summary ?? 'No summary provided.'}</p>

                      <InsightList title="Website Weaknesses" items={weaknesses.length > 0 ? weaknesses : painPoints} />
                      <InsightList title="Opportunities" items={opportunities} />
                      <InsightList title="Score Reasons" items={reasons} />
                    </div>

                    <form action={updateDevspaceOutreach} className="grid gap-3">
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
                          rows={10}
                          className="login-input min-h-0 resize-y py-2 text-sm leading-6"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-slate-200">
                        Review Note
                        <input name="note" className="login-input min-h-0 py-2 text-sm" placeholder="Optional internal note" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button name="action" value="save" className="button" type="submit">
                          Save Draft
                        </button>
                        <button name="action" value="approve" className="button" type="submit">
                          Approve To Send
                        </button>
                        <button name="action" value="reject" className="button border-red-300/40 bg-red-950/40 text-red-100" type="submit">
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

      <section className="panel">
        <h2>System Overview</h2>
        <p className="page-subtitle">
          This CRM is set up to manage DevSpace customer accounts, collect bot
          data, store sales outcomes, and improve outreach strategy over time.
        </p>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-white/10 bg-slate-950/25 p-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-slate-100">{value}</div>
    </div>
  )
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase text-slate-500">{title}</div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 pl-4 text-sm text-slate-200">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-300">None included.</p>
      )}
    </div>
  )
}
