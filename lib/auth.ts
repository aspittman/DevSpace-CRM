import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase-server'

export const DOMAIN_PORTFOLIO_OWNER_EMAIL = 'aaron@devspacetechnologies.com'

export function isDomainPortfolioOwner(profile: { email?: string | null } | null | undefined) {
  return profile?.email?.toLowerCase() === DOMAIN_PORTFOLIO_OWNER_EMAIL
}

export async function getCurrentProfile() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}

export async function requireUser() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  return profile
}

export async function requireAdmin() {
  const profile = await requireUser()

  if (profile.role !== 'admin') {
    redirect('/portal')
  }

  return profile
}

export async function requireDomainPortfolioOwner() {
  const profile = await requireAdmin()

  if (!isDomainPortfolioOwner(profile)) {
    redirect('/admin')
  }

  return profile
}

export async function requireCustomer() {
  const profile = await requireUser()

  if (profile.role === 'admin') {
    redirect('/admin')
  }

  return profile
}
