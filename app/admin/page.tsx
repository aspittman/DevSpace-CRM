import { supabaseAdmin } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/auth'

export default async function AdminDashboardPage() {
  await requireAdmin()

  const [{ count: leadCount }, { count: companyCount }, { count: botRunCount }] =
    await Promise.all([
      supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('companies').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('bot_runs').select('*', { count: 'exact', head: true }),
    ])

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 className="page-title">DevSpace Admin</h1>
          <p className="page-subtitle">
            Monitor customers, bot activity, lead flow, and sales intelligence.
          </p>
        </div>

        <a className="button" href="/admin/customers">
          View Customers
        </a>
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