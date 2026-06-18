import Link from 'next/link'
import { requireAdmin } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabase-admin'

type OrganizationRelation = {
  name: string
  slug: string | null
}

type CompanyRelation = {
  name: string
  domain: string | null
  website: string | null
  industry: string | null
  city: string | null
  state: string | null
}

type ContactRelation = {
  name: string | null
  email: string | null
  phone: string | null
  title: string | null
  linkedin_url: string | null
  verified_status: string
}

type LeadQueryRecord = {
  id: string
  organization_id: string
  source_bot: string
  lead_type: string
  status: string
  score: number
  summary: string | null
  pain_points: unknown
  raw_payload: unknown
  created_at: string
  updated_at: string
  organizations: OrganizationRelation[] | null
  companies: CompanyRelation[] | null
  contacts: ContactRelation[] | null
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

function firstRelation<T>(value: T[] | T | null | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export default async function LeadsPage() {
  await requireAdmin()

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select(`
      id,
      organization_id,
      source_bot,
      lead_type,
      status,
      score,
      summary,
      pain_points,
      raw_payload,
      created_at,
      updated_at,
      organizations (name, slug),
      companies (name, domain, website, industry, city, state),
      contacts (name, email, phone, title, linkedin_url, verified_status)
    `)
    .not('organization_id', 'is', null)
    .order('created_at', { ascending: false })

  const leads = (data ?? []) as unknown as LeadQueryRecord[]
  const sourceCounts = leads.reduce<Record<string, number>>((counts, lead) => {
    counts[lead.source_bot] = (counts[lead.source_bot] ?? 0) + 1
    return counts
  }, {})
  const openCount = leads.filter((lead) => lead.status !== 'closed').length
  const averageScore =
    leads.length > 0
      ? Math.round(leads.reduce((total, lead) => total + lead.score, 0) / leads.length)
      : 0

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">
            Leads from every bot that are linked to a Supabase organization ID.
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
          <div className="card-label">Organization Leads</div>
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
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-bold">Bot Lead Feed</h2>
            <p className="page-subtitle">
              Expand any lead to review organization, company, contact, scoring, and bot payload context.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(sourceCounts).map(([source, count]) => (
              <span key={source} className="status-pill">
                {formatBotName(source)} · {count}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {leads.length === 0 ? (
            <div className="empty-state">
              No bot leads with organization IDs were found in Supabase.
            </div>
          ) : (
            leads.map((lead) => {
              const organization = firstRelation(lead.organizations)
              const company = firstRelation(lead.companies)
              const contact = firstRelation(lead.contacts)
              const painPoints = stringifyList(lead.pain_points)
              const location = [company?.city, company?.state]
                .filter(Boolean)
                .join(', ')

              return (
                <details key={lead.id} className="data-row">
                  <summary className="grid cursor-pointer gap-4 p-4 md:grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_repeat(4,minmax(90px,0.7fr))] md:items-center">
                    <div>
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="font-bold text-white hover:text-cyan-200"
                      >
                        {company?.name ?? 'Unknown Company'}
                      </Link>
                      <div className="mt-1 break-all text-xs text-slate-400">
                        {company?.domain ?? company?.website ?? 'No domain'}
                      </div>
                    </div>
                    <Metric
                      label="Organization"
                      value={organization?.name ?? lead.organization_id}
                    />
                    <Metric label="Bot" value={formatBotName(lead.source_bot)} />
                    <Metric label="Score" value={lead.score} />
                    <Metric label="Status" value={lead.status} />
                    <Metric label="Created" value={formatDate(lead.created_at)} />
                  </summary>

                  <div className="border-t border-white/10 p-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <InfoBlock label="Organization ID" value={lead.organization_id} />
                      <InfoBlock label="Lead Type" value={lead.lead_type} />
                      <InfoBlock label="Updated" value={formatDate(lead.updated_at)} />
                      <InfoBlock label="Location" value={location || 'No location'} />
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                      <DetailPanel title="Contact">
                        <DetailLine label="Name" value={contact?.name ?? 'No contact name'} />
                        <DetailLine label="Email" value={contact?.email ?? 'No email'} />
                        <DetailLine label="Phone" value={contact?.phone ?? 'No phone'} />
                        <DetailLine label="Title" value={contact?.title ?? 'No title'} />
                        <DetailLine
                          label="Verified"
                          value={contact?.verified_status ?? 'unknown'}
                        />
                      </DetailPanel>

                      <DetailPanel title="Company">
                        <DetailLine label="Industry" value={company?.industry ?? 'No industry'} />
                        <DetailLine label="Domain" value={company?.domain ?? 'No domain'} />
                        <DetailLine label="Website" value={company?.website ?? 'No website'} />
                        <DetailLine label="City" value={company?.city ?? 'No city'} />
                        <DetailLine label="State" value={company?.state ?? 'No state'} />
                      </DetailPanel>

                      <DetailPanel title="Bot Context">
                        <DetailLine label="Lead ID" value={lead.id} />
                        <DetailLine label="Org Slug" value={organization?.slug ?? 'No slug'} />
                        <DetailLine label="Source" value={formatBotName(lead.source_bot)} />
                        <DetailLine label="Status" value={lead.status} />
                        <DetailLine label="Score" value={String(lead.score)} />
                      </DetailPanel>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <DetailPanel title="Summary">
                        <p className="m-0 text-sm leading-6 text-slate-200">
                          {lead.summary ?? 'No summary has been saved for this lead.'}
                        </p>
                      </DetailPanel>

                      <DetailPanel title="Pain Points">
                        {painPoints.length > 0 ? (
                          <ul className="m-0 space-y-2 pl-4 text-sm text-slate-200">
                            {painPoints.map((point, index) => (
                              <li key={index}>{point}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="m-0 text-sm text-slate-300">
                            No pain points were saved for this lead.
                          </p>
                        )}
                      </DetailPanel>
                    </div>
                  </div>
                </details>
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
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-bold text-slate-100">{value}</div>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200/80">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-bold text-white">{value}</div>
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
    <div className="grid grid-cols-[92px_1fr] gap-3 border-t border-white/10 py-2 first:border-t-0 first:pt-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="break-words text-sm text-slate-100">{value}</div>
    </div>
  )
}
