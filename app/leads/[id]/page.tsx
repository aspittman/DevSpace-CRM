import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select(`
      *,
      companies (*),
      contacts (*),
      lead_notes (*),
      activity_log (*)
    `)
    .eq('id', id)
    .single()

  if (!lead) return notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{lead.companies?.name ?? 'Lead Detail'}</h1>
        <p className="text-slate-600 mt-1">Full lead record from the {lead.source_bot} bot.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl bg-white border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Lead Summary</h2>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Status:</span> {lead.status}</p>
              <p><span className="font-medium">Score:</span> {lead.score}</p>
              <p><span className="font-medium">Type:</span> {lead.lead_type}</p>
              <p><span className="font-medium">Summary:</span> {lead.summary ?? '—'}</p>
            </div>
          </section>

          <section className="rounded-2xl bg-white border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Pain Points</h2>
            <div className="flex flex-wrap gap-2">
              {lead.pain_points?.map((item: string) => (
                <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Notes</h2>
            <div className="space-y-3">
              {lead.lead_notes?.length ? lead.lead_notes.map((note: any) => (
                <div key={note.id} className="rounded-xl border p-3 text-sm">
                  <div>{note.body}</div>
                  <div className="text-slate-500 text-xs mt-2">
                    {new Date(note.created_at).toLocaleString()}
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No notes yet.</p>}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Company</h2>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Website:</span> {lead.companies?.website ?? '—'}</p>
              <p><span className="font-medium">Domain:</span> {lead.companies?.domain ?? '—'}</p>
              <p><span className="font-medium">Industry:</span> {lead.companies?.industry ?? '—'}</p>
              <p><span className="font-medium">Location:</span> {[lead.companies?.city, lead.companies?.state].filter(Boolean).join(', ') || '—'}</p>
            </div>
          </section>

          <section className="rounded-2xl bg-white border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Contact</h2>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Name:</span> {lead.contacts?.name ?? '—'}</p>
              <p><span className="font-medium">Email:</span> {lead.contacts?.email ?? '—'}</p>
              <p><span className="font-medium">Title:</span> {lead.contacts?.title ?? '—'}</p>
            </div>
          </section>

          <section className="rounded-2xl bg-white border shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
            <div className="space-y-3 text-sm">
              {lead.activity_log?.length ? lead.activity_log.map((event: any) => (
                <div key={event.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                  <div className="font-medium">{event.event_type}</div>
                  <div className="text-slate-500 text-xs mt-1">
                    {new Date(event.created_at).toLocaleString()}
                  </div>
                </div>
              )) : <p className="text-slate-500">No activity yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}