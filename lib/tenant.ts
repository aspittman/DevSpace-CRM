import { supabaseAdmin } from './supabase'

export async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) return null
  return data
}

export async function getUserOrganizations(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select(`
      *,
      organizations (*)
    `)
    .eq('user_id', userId)

  if (error) return []
  return data ?? []
}

export async function getPrimaryOrganization(userId: string) {
  const orgs = await getUserOrganizations(userId)
  return orgs[0]?.organizations ?? null
}