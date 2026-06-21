import { Check, Send, X } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { logActivity } from '../../../lib/activity'
import {
  mergeLeadMetadata,
  outreachBody,
  outreachDomain,
  outreachStatus,
  outreachSubject,
  scoreReasons,
} from '../../../lib/outreach'

type LeadRecord = {
  id: string
  organization_id: string
  status: string
  score: number
  summary: string | null
  raw_payload: unknown
  created_at: string
  updated_at: string
  organizations: { name: string }[] | { name: string } | null
  companies: { name: string; domain: string | null; website: string | null }[] | {
    name: string
    domain: string | null
    website: string | null
  } | null
  contacts: {
    name: string | null
    email: string | null
    title: string | null
  }[] | {
    name: string | null
    email: string | null
    title: string | null
  } | null
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

function firstRelation<T>(value: T[] | T | null | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

async function updateOutreach(formData: FormData) {
  'use server'

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

  const { error } = await supabaseAdmin
    .from('leads')
    .update(updatePayload)
    .eq('id', leadId)

  if (error) throw error

  await logActivity(leadId, action === 'save' ? 'outreach_draft_edited' : 'outreach_reviewed', {
    action,
    status: nextStatus,
    note: note || null,
  })

  revalidatePath('/admin/apollo-outreach')
}

export default async function ApolloOutreachPage() {
  const [{ data: leads, error: leadsError }, { data: services, error: servicesError }] =
    await Promise.all([
      supabaseAdmin
        .from('leads')
        .select(`
          id,
          organization_id,
          status,
          score,
          summary,
          raw_payload,
          created_at,
          updated_at,
          organizations (name),
          companies (name, domain, website),
          contacts (name, email, title)
        `)
        .eq('source_bot', 'apollo_outreach')
        .order('created_at', { ascending: false })
        .limit(200),
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
        .eq('service_key', 'apollo_outreach')
        .order('updated_at', { ascending: false }),
    ])

  const outreachLeads = ((leads ?? []) as unknown as LeadRecord[]).filter((lead) =>
    ['drafted', 'approved', 'rejected', 'sent', 'responded', 'bounced', 'unsubscribed'].includes(
      outreachStatus(lead),
    ),
  )
  const serviceRows = (services ?? []) as unknown as ServiceRecord[]
  const draftedCount = outreachLeads.filter((lead) => outreachStatus(lead) === 'drafted').length
  const approvedCount = outreachLeads.filter((lead) => outreachStatus(lead) === 'approved').length
  const sentCount = outreachLeads.filter((lead) => outreachStatus(lead) === 'sent').length
  const responseCount = outreachLeads.filter((lead) =>
    ['responded', 'positive', 'negative', 'offer_received'].includes(outreachStatus(lead)),
  ).length

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Apollo Outreach</h1>
          <p className="page-subtitle">
            Review generated domain-buyer emails, approve sends, and track outreach status.
          </p>
        </div>
      </div>

      {leadsError || servicesError ? (
        <div className="panel border-red-300/40 bg-red-950/40 text-red-100">
          <h2 className="m-0 text-lg font-bold">Apollo outreach could not be loaded</h2>
          <p className="mt-2 text-sm">{leadsError?.message ?? servicesError?.message}</p>
        </div>
      ) : null}

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
          <div className="card-label">Responses</div>
          <div className="card-value">{responseCount}</div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-bold">Service Status</h2>
            <p className="page-subtitle">
              Apollo outreach should be enabled per organization before the bot starts drafting.
            </p>
          </div>
          <span className="status-pill">
            <Send className="mr-2 h-3.5 w-3.5" />
            Sent {sentCount}
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {serviceRows.length === 0 ? (
            <div className="empty-state">
              No apollo_outreach service records are configured yet.
            </div>
          ) : (
            serviceRows.map((service) => {
              const organization = firstRelation(service.organizations)
              return (
                <div key={service.id} className="data-row p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">
                        {organization?.name ?? service.organization_id}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Daily limit {service.daily_limit} · Approval{' '}
                        {service.approval_required ? 'required' : 'optional'}
                      </div>
                    </div>
                    <span className="status-pill">
                      {service.is_enabled ? 'enabled' : 'disabled'}
                    </span>
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
          <h2 className="m-0 text-xl font-bold">Draft Review Queue</h2>
          <p className="page-subtitle">
            Edits are saved as the CRM version of the email and will be returned to the sender queue.
          </p>
        </div>

        <div className="grid gap-4">
          {outreachLeads.length === 0 ? (
            <div className="empty-state">No Apollo outreach drafts have been ingested yet.</div>
          ) : (
            outreachLeads.map((lead) => {
              const company = firstRelation(lead.companies)
              const contact = firstRelation(lead.contacts)
              const reasons = scoreReasons(lead)
              const subject = outreachSubject(lead)
              const body = outreachBody(lead)
              const status = outreachStatus(lead)

              return (
                <article key={lead.id} className="data-row p-4">
                  <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="m-0 text-lg font-bold text-white">
                            {contact?.name ?? 'Unknown prospect'}
                          </h3>
                          <p className="mt-1 text-sm text-slate-300">
                            {contact?.title ?? 'No title'} · {company?.name ?? 'Unknown company'}
                          </p>
                        </div>
                        <span className="status-pill">{status || lead.status}</span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Metric label="Email" value={contact?.email ?? 'No email'} />
                        <Metric label="Domain" value={outreachDomain(lead) || 'No domain'} />
                        <Metric label="Score" value={lead.score} />
                        <Metric label="Updated" value={formatDate(lead.updated_at)} />
                      </div>

                      <div className="mt-4">
                        <div className="text-xs font-semibold uppercase text-slate-500">
                          Score Reasons
                        </div>
                        {reasons.length > 0 ? (
                          <ul className="mt-2 space-y-1 pl-4 text-sm text-slate-200">
                            {reasons.map((reason, index) => (
                              <li key={`${lead.id}-${index}`}>{reason}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-slate-300">
                            No score reasons were included in the draft payload.
                          </p>
                        )}
                      </div>
                    </div>

                    <form action={updateOutreach} className="grid gap-3">
                      <input type="hidden" name="lead_id" value={lead.id} />
                      <label className="grid gap-2 text-sm font-bold text-slate-200">
                        Subject
                        <input
                          name="subject"
                          defaultValue={subject}
                          className="login-input min-h-0 py-2 text-sm"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-slate-200">
                        Email Body
                        <textarea
                          name="body"
                          defaultValue={body}
                          rows={9}
                          className="login-input min-h-0 resize-y py-2 text-sm leading-6"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-slate-200">
                        Review Note
                        <input
                          name="note"
                          className="login-input min-h-0 py-2 text-sm"
                          placeholder="Optional internal note"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button name="action" value="save" className="button" type="submit">
                          Save
                        </button>
                        <button name="action" value="approve" className="button" type="submit">
                          <Check className="mr-2 inline h-4 w-4" />
                          Approve
                        </button>
                        <button
                          name="action"
                          value="reject"
                          className="button border-red-300/40 bg-red-950/40 text-red-100"
                          type="submit"
                        >
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
