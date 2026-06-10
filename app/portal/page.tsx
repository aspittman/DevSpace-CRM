import { requireUser } from '../../lib/auth'
import { createSupabaseServerClient } from '../../lib/supabase-server'

const recommendedEvents = [
  {
    name: 'Downtown Summer Market',
    location: 'Salt Lake City, UT',
    score: 92,
    difficulty: 'Medium',
    footTraffic: 'High',
    previousSales: '$1,850',
  },
  {
    name: 'Food Truck Friday',
    location: 'Provo, UT',
    score: 87,
    difficulty: 'Low',
    footTraffic: 'Medium-High',
    previousSales: '$1,240',
  },
  {
    name: 'St. George Night Market',
    location: 'St. George, UT',
    score: 81,
    difficulty: 'High',
    footTraffic: 'High',
    previousSales: '$2,100',
  },
]

export default async function PortalPage() {
  const profile = await requireUser()
  const supabase = await createSupabaseServerClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-8 py-10">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-300">
          Customer Portal
        </p>

        <h1 className="mt-4 text-4xl font-bold">
          Event Intelligence Dashboard
        </h1>

        <p className="mt-3 max-w-2xl text-slate-300">
          Recommended opportunities, difficulty scores, traffic estimates, and
          sales insights powered by DevSpace bot data.
        </p>
      </section>

      <section className="grid gap-5 px-8 py-8 md:grid-cols-4">
        <MetricCard label="Recommended Events" value="3" />
        <MetricCard label="Avg. Event Score" value="86%" />
        <MetricCard label="Projected Foot Traffic" value="High" />
        <MetricCard label="Previous Sales Tracked" value="$5,190" />
      </section>

      <section className="px-8 pb-10">
        <div className="rounded-3xl border border-white/10 bg-white/95 p-6 text-slate-950 shadow-2xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Recommended Events</h2>
              <p className="text-sm text-slate-600">
                Best-fit events ranked by traffic, difficulty, and past sales
                potential.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            {recommendedEvents.map((event) => (
              <div
                key={event.name}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{event.name}</h3>
                    <p className="text-sm text-slate-600">{event.location}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <Badge label="Score" value={`${event.score}%`} />
                    <Badge label="Difficulty" value={event.difficulty} />
                    <Badge label="Foot Traffic" value={event.footTraffic} />
                    <Badge label="Previous Sales" value={event.previousSales} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-8 pb-10">
        <div className="rounded-3xl border border-white/10 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Lead Activity</h2>
          <p className="mt-2 text-sm text-slate-400">
            Current CRM leads connected to this customer account.
          </p>

          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-300">
            {JSON.stringify(leads ?? [], null, 2)}
          </pre>
        </div>
      </section>
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/95 p-6 text-slate-950 shadow-xl">
      <p className="text-sm font-semibold text-blue-700">{label}</p>
      <div className="mt-3 text-3xl font-bold">{value}</div>
    </div>
  )
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-bold text-slate-950">{value}</p>
    </div>
  )
}