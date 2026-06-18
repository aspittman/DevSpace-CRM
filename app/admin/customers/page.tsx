import type { ReactNode } from 'react'
import { requireAdmin } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabase-admin'

type Organization = {
  id: string
  name: string
  slug: string | null
  type: string
  created_at: string
  updated_at: string
}

type Profile = {
  id: string
  email: string
  role: string
  organization_id: string | null
  created_at: string
}

type OrganizationMember = {
  id: string
  organization_id: string
  user_id: string
  role: string
  created_at: string
}

type OrganizationService = {
  id: string
  organization_id: string
  service_key: string
  service_name: string
  niche: string | null
  is_enabled: boolean
  email_enabled: boolean
  approval_required: boolean
  daily_limit: number
  created_at: string
  updated_at: string
}

type Company = {
  id: string
  organization_id: string | null
  name: string
  domain: string | null
  website: string | null
  industry: string | null
  city: string | null
  state: string | null
  source_bot: string | null
  created_at: string
}

type Contact = {
  id: string
  organization_id: string | null
  company_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  title: string | null
  linkedin_url: string | null
  verified_status: string
  created_at: string
}

type Lead = {
  id: string
  organization_id: string | null
  source_bot: string
  lead_type: string
  status: string
  score: number
  summary: string | null
  created_at: string
}

type SalesRecord = {
  id: string
  organization_id: string
  customer_name: string | null
  lead_source: string | null
  service_sold: string | null
  deal_value: number | null
  status: string
  contacted_at: string | null
  closed_at: string | null
  created_at: string
}

type BotRun = {
  id: string
  organization_id: string | null
  bot_name: string
  status: string
  records_found: number
  records_inserted: number
  duplicates_detected: number
  started_at: string
  ended_at: string | null
}

type CustomerRecord = Organization & {
  people: Array<Profile & { memberRole?: string }>
  services: OrganizationService[]
  companies: Company[]
  contacts: Contact[]
  leads: Lead[]
  salesRecords: SalesRecord[]
  botRuns: BotRun[]
}

function byOrganizationId<T extends { organization_id: string | null }>(rows: T[]) {
  return rows.reduce<Record<string, T[]>>((groups, row) => {
    if (!row.organization_id) return groups
    groups[row.organization_id] = groups[row.organization_id] ?? []
    groups[row.organization_id].push(row)
    return groups
  }, {})
}

function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatMoney(value: number | null) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function latestDate(rows: Array<{ created_at?: string; started_at?: string }>) {
  const timestamps = rows
    .map((row) => row.created_at ?? row.started_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())

  if (timestamps.length === 0) return null

  return new Date(Math.max(...timestamps)).toISOString()
}

export default async function AdminCustomersPage() {
  await requireAdmin()

  const [
    organizationsResult,
    profilesResult,
    membersResult,
    servicesResult,
    companiesResult,
    contactsResult,
    leadsResult,
    salesResult,
    botRunsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id, name, slug, type, created_at, updated_at')
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('profiles')
      .select('id, email, role, organization_id, created_at')
      .not('organization_id', 'is', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('organization_members')
      .select('id, organization_id, user_id, role, created_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('organization_services')
      .select('id, organization_id, service_key, service_name, niche, is_enabled, email_enabled, approval_required, daily_limit, created_at, updated_at')
      .order('service_name', { ascending: true }),
    supabaseAdmin
      .from('companies')
      .select('id, organization_id, name, domain, website, industry, city, state, source_bot, created_at')
      .not('organization_id', 'is', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('contacts')
      .select('id, organization_id, company_id, name, email, phone, title, linkedin_url, verified_status, created_at')
      .not('organization_id', 'is', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('leads')
      .select('id, organization_id, source_bot, lead_type, status, score, summary, created_at')
      .not('organization_id', 'is', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('sales_records')
      .select('id, organization_id, customer_name, lead_source, service_sold, deal_value, status, contacted_at, closed_at, created_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('bot_runs')
      .select('id, organization_id, bot_name, status, records_found, records_inserted, duplicates_detected, started_at, ended_at')
      .not('organization_id', 'is', null)
      .order('started_at', { ascending: false }),
  ])

  const queryErrors = [
    organizationsResult.error,
    profilesResult.error,
    membersResult.error,
    servicesResult.error,
    companiesResult.error,
    contactsResult.error,
    leadsResult.error,
    salesResult.error,
    botRunsResult.error,
  ].filter(Boolean)

  const organizations = (organizationsResult.data ?? []) as Organization[]
  const profiles = (profilesResult.data ?? []) as Profile[]
  const members = (membersResult.data ?? []) as OrganizationMember[]
  const servicesByOrg = byOrganizationId((servicesResult.data ?? []) as OrganizationService[])
  const companiesByOrg = byOrganizationId((companiesResult.data ?? []) as Company[])
  const contactsByOrg = byOrganizationId((contactsResult.data ?? []) as Contact[])
  const leadsByOrg = byOrganizationId((leadsResult.data ?? []) as Lead[])
  const salesByOrg = byOrganizationId((salesResult.data ?? []) as SalesRecord[])
  const botRunsByOrg = byOrganizationId((botRunsResult.data ?? []) as BotRun[])

  const memberRoleByUserAndOrg = new Map(
    members.map((member) => [`${member.organization_id}:${member.user_id}`, member.role])
  )
  const peopleByOrg = byOrganizationId(profiles)

  const customers: CustomerRecord[] = organizations.map((organization) => ({
    ...organization,
    people: (peopleByOrg[organization.id] ?? []).map((profile) => ({
      ...profile,
      memberRole: memberRoleByUserAndOrg.get(`${organization.id}:${profile.id}`),
    })),
    services: servicesByOrg[organization.id] ?? [],
    companies: companiesByOrg[organization.id] ?? [],
    contacts: contactsByOrg[organization.id] ?? [],
    leads: leadsByOrg[organization.id] ?? [],
    salesRecords: salesByOrg[organization.id] ?? [],
    botRuns: botRunsByOrg[organization.id] ?? [],
  }))

  const customerPeopleCount = customers.reduce(
    (total, customer) => total + customer.people.length,
    0
  )
  const totalDealValue = customers.reduce(
    (total, customer) =>
      total +
      customer.salesRecords.reduce(
        (customerTotal, record) => customerTotal + Number(record.deal_value ?? 0),
        0
      ),
    0
  )

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">
            Every Supabase organization with linked people, services, CRM records, sales data, and bot activity.
          </p>
        </div>
      </div>

      {queryErrors.length > 0 ? (
        <div className="panel border-red-200 bg-red-50 text-red-900">
          <h2 className="m-0 text-lg font-bold">Some customer data could not be loaded</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {queryErrors.map((error, index) => (
              <li key={index}>{error?.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="card-grid">
        <div className="card">
          <div className="card-label">Organizations</div>
          <div className="card-value">{customers.length}</div>
        </div>
        <div className="card">
          <div className="card-label">People With Org ID</div>
          <div className="card-value">{customerPeopleCount}</div>
        </div>
        <div className="card">
          <div className="card-label">Recorded Deal Value</div>
          <div className="card-value">{formatMoney(totalDealValue)}</div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-bold">Customer Directory</h2>
            <p className="page-subtitle">
              Open a customer to see the full Supabase profile currently associated with that organization.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {customers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
              No organizations were found in Supabase.
            </div>
          ) : (
            customers.map((customer) => {
              const latestActivity = latestDate([
                ...customer.people,
                ...customer.companies,
                ...customer.contacts,
                ...customer.leads,
                ...customer.salesRecords,
                ...customer.botRuns,
              ])
              const dealValue = customer.salesRecords.reduce(
                (total, record) => total + Number(record.deal_value ?? 0),
                0
              )

              return (
                <details
                  key={customer.id}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  <summary className="cursor-pointer p-4 hover:bg-slate-50">
                    <div>
                      <div className="font-bold text-slate-950">{customer.name}</div>
                      <div className="mt-1 break-all text-xs text-slate-500">
                        {customer.slug ?? 'No slug'} · {customer.id}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Metric label="Type" value={customer.type} />
                      <Metric label="People" value={customer.people.length} />
                      <Metric label="Contacts" value={customer.contacts.length} />
                      <Metric label="Leads" value={customer.leads.length} />
                      <Metric label="Sales" value={formatMoney(dealValue)} />
                      <Metric label="Latest" value={formatDate(latestActivity)} />
                    </div>
                  </summary>

                  <div className="border-t border-slate-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <InfoBlock label="Created" value={formatDate(customer.created_at)} />
                      <InfoBlock label="Updated" value={formatDate(customer.updated_at)} />
                      <InfoBlock label="Services" value={customer.services.length} />
                      <InfoBlock label="Bot Runs" value={customer.botRuns.length} />
                    </div>

                    <CustomerSection title="People">
                      <CompactTable
                        empty="No profiles with this organization ID."
                        headers={['Email', 'Profile Role', 'Member Role', 'Created']}
                        rows={customer.people.map((person) => [
                          person.email,
                          person.role,
                          person.memberRole ?? 'Not in members table',
                          formatDate(person.created_at),
                        ])}
                      />
                    </CustomerSection>

                    <CustomerSection title="Enabled Services">
                      <CompactTable
                        empty="No services configured."
                        headers={['Service', 'Niche', 'Enabled', 'Email', 'Approval', 'Daily Limit']}
                        rows={customer.services.map((service) => [
                          service.service_name,
                          service.niche ?? 'All niches',
                          service.is_enabled ? 'Yes' : 'No',
                          service.email_enabled ? 'Yes' : 'No',
                          service.approval_required ? 'Required' : 'Not required',
                          String(service.daily_limit),
                        ])}
                      />
                    </CustomerSection>

                    <CustomerSection title="Contacts">
                      <CompactTable
                        empty="No contacts with this organization ID."
                        headers={['Name', 'Email', 'Phone', 'Title', 'Verified', 'Created']}
                        rows={customer.contacts.map((contact) => [
                          contact.name ?? 'Unnamed contact',
                          contact.email ?? 'No email',
                          contact.phone ?? 'No phone',
                          contact.title ?? 'No title',
                          contact.verified_status,
                          formatDate(contact.created_at),
                        ])}
                      />
                    </CustomerSection>

                    <CustomerSection title="Companies">
                      <CompactTable
                        empty="No companies with this organization ID."
                        headers={['Name', 'Domain', 'Industry', 'Location', 'Source', 'Created']}
                        rows={customer.companies.map((company) => [
                          company.name,
                          company.domain ?? company.website ?? 'No domain',
                          company.industry ?? 'No industry',
                          [company.city, company.state].filter(Boolean).join(', ') || 'No location',
                          company.source_bot ?? 'Unknown',
                          formatDate(company.created_at),
                        ])}
                      />
                    </CustomerSection>

                    <CustomerSection title="Leads">
                      <CompactTable
                        empty="No leads with this organization ID."
                        headers={['Source', 'Type', 'Status', 'Score', 'Summary', 'Created']}
                        rows={customer.leads.map((lead) => [
                          lead.source_bot,
                          lead.lead_type,
                          lead.status,
                          String(lead.score),
                          lead.summary ?? 'No summary',
                          formatDate(lead.created_at),
                        ])}
                      />
                    </CustomerSection>

                    <CustomerSection title="Sales Records">
                      <CompactTable
                        empty="No sales records with this organization ID."
                        headers={['Customer', 'Service', 'Source', 'Value', 'Status', 'Closed']}
                        rows={customer.salesRecords.map((record) => [
                          record.customer_name ?? customer.name,
                          record.service_sold ?? 'No service',
                          record.lead_source ?? 'No source',
                          formatMoney(Number(record.deal_value ?? 0)),
                          record.status,
                          formatDate(record.closed_at),
                        ])}
                      />
                    </CustomerSection>

                    <CustomerSection title="Bot Runs">
                      <CompactTable
                        empty="No bot runs with this organization ID."
                        headers={['Bot', 'Status', 'Found', 'Inserted', 'Duplicates', 'Started']}
                        rows={customer.botRuns.map((run) => [
                          run.bot_name,
                          run.status,
                          String(run.records_found),
                          String(run.records_inserted),
                          String(run.duplicates_detected),
                          formatDate(run.started_at),
                        ])}
                      />
                    </CustomerSection>
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
      <div className="mt-1 truncate text-sm font-bold text-slate-900">{value}</div>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
    </div>
  )
}

function CustomerSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-base font-bold text-slate-950">{title}</h3>
      {children}
    </div>
  )
}

function CompactTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: string[][]
  empty: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
        {empty}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            {headers.map((header) => (
              <th key={header} className="p-3 font-bold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-slate-200 align-top">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="max-w-[320px] p-3">
                  <span className="line-clamp-3 break-words">{cell}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
