import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export default async function LeadsPage() {
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select(`
      id,
      source_bot,
      status,
      score,
      summary,
      created_at,
      companies (name, domain),
      contacts (name, email)
    `)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Leads</h1>
        <p className="text-slate-600 mt-1">Review and manage leads from all three bots.</p>
      </div>
<div className="rounded-2xl bg-white border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-4">Company</th>
              <th className="p-4">Contact</th>
              <th className="p-4">Source</th>
              <th className="p-4">Score</th>
              <th className="p-4">Status</th>
              <th className="p-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads?.map((lead: any) => (
              <tr key={lead.id} className="border-t hover:bg-slate-50">
                <td className="p-4">
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.companies?.name ?? 'Unknown Company'}
                  </Link>
                  <div className="text-slate-500 text-xs">{lead.companies?.domain ?? ''}</div>
                </td>
                <td className="p-4">
                  <div>{lead.contacts?.name ?? '—'}</div>
                  <div className="text-slate-500 text-xs">{lead.contacts?.email ?? ''}</div>
                </td>
                <td className="p-4 capitalize">{lead.source_bot.replace('_', ' ')}</td>
                <td className="p-4">{lead.score}</td>
                <td className="p-4">{lead.status}</td>
                <td className="p-4">{new Date(lead.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            </tbody>
        </table>
      </div>
    </div>
  )
}