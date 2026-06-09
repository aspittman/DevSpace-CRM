import { requireUser } from '../../lib/auth'
import { createSupabaseServerClient } from '../../lib/supabase-server'

export default async function PortalPage() {
  const profile = await requireUser()
  const supabase = await createSupabaseServerClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })

  return (
    <main>
      <h1>Customer Portal</h1>
      <pre>{JSON.stringify(leads, null, 2)}</pre>
    </main>
  )
}