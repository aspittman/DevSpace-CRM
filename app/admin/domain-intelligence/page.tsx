import Link from 'next/link'
import { requireAdmin } from '../../../lib/auth'
import { buildDomainPerformance } from '../../../lib/domain-performance'
import { supabaseAdmin } from '../../../lib/supabase-admin'

const filters = [
  { key: 'best-to-buy', label: 'Best domains to buy' },
  { key: 'needs-outreach', label: 'Needs outreach' },
  { key: 'drafts-awaiting-approval', label: 'Drafts awaiting approval' },
  { key: 'positive-replies', label: 'Positive buyer replies' },
  { key: 'sold-profitable', label: 'Sold/profitable' },
]

function formatMoney(value: number | null) {
  if (value == null) return 'n/a'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function applyFilter(rows: ReturnType<typeof buildDomainPerformance>, filter: string) {
  if (filter === 'best-to-buy') {
    return rows.filter((row) => {
      return (
        Number(row.resale_likelihood_score ?? 0) >= 70 &&
        !['purchased', 'listed', 'sold', 'rejected', 'expired'].includes(
          String(row.domain_lifecycle_state ?? '').toLowerCase(),
        )
      )
    })
  }

  if (filter === 'needs-outreach') {
    return rows.filter((row) => {
      return row.outreach_count === 0 && !['sold', 'rejected', 'expired'].includes(
        String(row.domain_lifecycle_state ?? '').toLowerCase(),
      )
    })
  }

  if (filter === 'drafts-awaiting-approval') {
    return rows.filter((row) => row.email_approval_state === 'drafted')
  }

  if (filter === 'positive-replies') {
    return rows.filter((row) => row.positive_responses > 0)
  }

  if (filter === 'sold-profitable') {
    return rows.filter((row) => {
      return row.domain_lifecycle_state === 'sold' && Number(row.gross_profit ?? 0) > 0
    })
  }

  return rows
}

export default async function DomainIntelligencePage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>
}) {
  await requireAdmin()

  const params = await searchParams
  const activeFilter = params?.filter ?? 'best-to-buy'

  const [{ data: leads, error: leadsError }, { data: sales, error: salesError }] =
    await Promise.all([
      supabaseAdmin
        .from('leads')
        .select('id, status, score, source_bot, lead_type, summary, raw_payload, created_at, email_approval_state, domain_lifecycle_state')
        .not('organization_id', 'is', null)
        .in('source_bot', ['domain_merchant', 'apollo_outreach', 'afternic_sync'])
        .order('created_at', { ascending: false })
        .limit(3000),
      supabaseAdmin
        .from('sales_records')
        .select('id, lead_id, customer_name, lead_source, service_sold, deal_value, status, notes, closed_at, created_at, domain_name, raw_payload, purchase_price, gross_profit')
        .order('created_at', { ascending: false })
        .limit(3000),
    ])

  const rows = buildDomainPerformance((leads ?? []) as any[], (sales ?? []) as any[])
  const filteredRows = applyFilter(rows, activeFilter)
  const totalProfit = filteredRows.reduce((sum, row) => sum + Number(row.gross_profit ?? 0), 0)

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Domain Intelligence</h1>
          <p className="page-subtitle">
            Unified Domain Merchant, Apollo Outreach, and Afternic performance by domain.
          </p>
        </div>
      </div>

      {leadsError || salesError ? (
        <div className="panel border-red-300/40 bg-red-950/40 text-red-100">
          <h2 className="m-0 text-lg font-bold">Domain intelligence could not be loaded</h2>
          <p className="mt-2 text-sm">{leadsError?.message ?? salesError?.message}</p>
        </div>
      ) : null}

      <section className="card-grid">
        <div className="card">
          <div className="card-label">Domains</div>
          <div className="card-value">{filteredRows.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Positive Replies</div>
          <div className="card-value">
            {filteredRows.reduce((sum, row) => sum + row.positive_responses, 0)}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Gross Profit</div>
          <div className="card-value">{formatMoney(totalProfit)}</div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-5 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link
              key={filter.key}
              href={`/admin/domain-intelligence?filter=${filter.key}`}
              className={`status-pill ${activeFilter === filter.key ? 'border-cyan-300/60 text-cyan-100' : ''}`}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3">
          {filteredRows.length === 0 ? (
            <div className="empty-state">No domains match this filter yet.</div>
          ) : (
            filteredRows.map((row) => (
              <article key={row.domain} className="data-row p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 break-all text-lg font-bold text-white">{row.domain}</h2>
                    <p className="mt-1 text-sm text-slate-300">
                      {row.niche ?? 'No niche'} · {row.category ?? 'No category'}
                    </p>
                  </div>
                  <span className="status-pill">
                    {row.domain_lifecycle_state ?? row.status ?? 'unknown'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                  <Metric label="Score" value={row.resale_likelihood_score ?? 'n/a'} />
                  <Metric label="Ask" value={formatMoney(row.ask_price)} />
                  <Metric label="Sale" value={formatMoney(row.sale_price)} />
                  <Metric label="Cost" value={formatMoney(row.purchase_price)} />
                  <Metric label="Profit" value={formatMoney(row.gross_profit)} />
                  <Metric label="Sent" value={row.sent} />
                  <Metric label="Replies" value={row.positive_responses} />
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
