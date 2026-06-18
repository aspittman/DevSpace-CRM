import Link from 'next/link'
import { requireCustomer } from '../../../lib/auth'
import { createSupabaseServerClient } from '../../../lib/supabase-server'

type LeadRecord = {
  id: string
  source_bot: string
  lead_type: string
  status: string
  score: number
  summary: string | null
  pain_points: unknown
  created_at: string
  companies:
    | {
        name: string
        domain: string | null
        website: string | null
        industry: string | null
        city: string | null
        state: string | null
      }[]
    | null
  contacts:
    | {
        name: string | null
        email: string | null
        phone: string | null
        title: string | null
      }[]
    | null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatBotName(value: string) {
  return value.replace(/_/g, ' ')
}

function firstRelation<T>(value: T[] | T | null | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function stringifyList(value: unknown) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') return JSON.stringify(item)
        return String(item)
      })
      .filter(Boolean)
  }
  if (typeof value === 'string') return [value]
  return [JSON.stringify(value)]
}

export default async function PortalLeadsPage() {
  const profile = await requireCustomer()
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from('leads')
    .select(`
      id,
      source_bot,
      lead_type,
      status,
      score,
      summary,
      pain_points,
      created_at,
      companies (name, domain, website, industry, city, state),
      contacts (name, email, phone, title)
    `)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  const leads = (data ?? []) as unknown as LeadRecord[]
  const openCount = leads.filter((lead) => lead.status !== 'closed').length
  const averageScore =
    leads.length > 0
      ? Math.round(leads.reduce((total, lead) => total + Number(lead.score ?? 0), 0) / leads.length)
      : 0

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">
            Review CRM leads connected to your customer account.
          </p>
        </div>
      </div>

      {error ? (
        <div className="panel border-red-300/40 bg-red-950/40 text-red-100">
          <h2 className="m-0 text-lg font-bold">Lead data could not be loaded</h2>
          <p className="mt-2 text-sm">{error.message}</p>
        </div>
      ) : null}

      <section className="card-grid">
        <div className="card">
          <div className="card-label">Total Leads</div>
          <div className="card-value">{leads.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Open Leads</div>
          <div className="card-value">{openCount}</div>
        </div>
        <div className="card">
          <div className="card-label">Average Score</div>
          <div className="card-value">{averageScore}</div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-5">
          <h2 className="m-0 text-xl font-bold">Lead Grid</h2>
          <p className="page-subtitle">
            Each card groups company, contact, scoring, and summary details.
          </p>
        </div>

        {leads.length === 0 ? (
          <div className="empty-state">No leads were found for this account.</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {leads.map((lead) => {
              const company = firstRelation(lead.companies)
              const contact = firstRelation(lead.contacts)
              const painPoints = stringifyList(lead.pain_points)
              const location = [company?.city, company?.state]
                .filter(Boolean)
                .join(', ')

              return (
                <article key={lead.id} className="data-row p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/portal/leads/${lead.id}`}
                        className="font-bold text-white hover:text-cyan-200"
                      >
                        {company?.name ?? 'Unknown Company'}
                      </Link>
                      <div className="mt-1 break-all text-xs text-slate-400">
                        {company?.domain ?? company?.website ?? 'No domain'}
                      </div>
                    </div>
                    <span className="status-pill">{lead.status}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Metric label="Score" value={lead.score} />
                    <Metric label="Bot" value={formatBotName(lead.source_bot)} />
                    <Metric label="Type" value={lead.lead_type} />
                    <Metric label="Created" value={formatDate(lead.created_at)} />
                    <Metric label="Location" value={location || 'No location'} />
                    <Metric label="Contact" value={contact?.name ?? 'No contact'} />
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <DetailPanel title="Summary">
                      <p className="m-0 line-clamp-5 text-sm leading-6 text-slate-200">
                        {lead.summary ?? 'No summary has been saved for this lead.'}
                      </p>
                    </DetailPanel>

                    <DetailPanel title="Contact">
                      <DetailLine label="Email" value={contact?.email ?? 'No email'} />
                      <DetailLine label="Phone" value={contact?.phone ?? 'No phone'} />
                      <DetailLine label="Title" value={contact?.title ?? 'No title'} />
                    </DetailPanel>
                  </div>

                  {painPoints.length > 0 ? (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200/80">
                        Pain Points
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {painPoints.slice(0, 4).map((point, index) => (
                          <span key={index} className="status-pill normal-case">
                            {point}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-bold text-slate-100">{value}</div>
    </div>
  )
}

function DetailPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/35 p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-cyan-100">
        {title}
      </h3>
      {children}
    </div>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 border-t border-white/10 py-2 first:border-t-0 first:pt-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="break-words text-sm text-slate-100">{value}</div>
    </div>
  )
}
