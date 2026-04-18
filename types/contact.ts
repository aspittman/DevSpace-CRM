export type VerifiedStatus = 'unknown' | 'unverified' | 'verified' | 'bounced'

export interface Contact {
  id: string
  company_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  title: string | null
  linkedin_url: string | null
  verified_status: VerifiedStatus
  created_at: string
  updated_at: string
}