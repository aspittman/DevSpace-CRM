import { supabaseAdmin } from '../../lib/supabase'

export default async function DashboardPage() {
  const [{ count: leadCount }, { count: companyCount }, { count: botRunCount }] = await Promise.all([
    supabaseAdmin.from('leads').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('companies').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('bot_runs').select('*', { count: 'exact', head: true }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-600 mt-1">Overview of your DevSpace lead pipeline.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="text-sm text-slate-500">Total Leads</div>
          <div className="text-3xl font-semibold mt-2">{leadCount ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="text-sm text-slate-500">Companies</div>
          <div className="text-3xl font-semibold mt-2">{companyCount ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="text-sm text-slate-500">Bot Runs</div>
          <div className="text-3xl font-semibold mt-2">{botRunCount ?? 0}</div>
        </div>
      </div>
    </div>
  )
}