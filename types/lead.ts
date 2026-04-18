export type SourceBot = 'domain' | 'website' | 'app_store'
export type LeadType = 'domain_outreach' | 'website_outreach' | 'app_outreach'
export type LeadStatus =
  | 'new'
  | 'reviewing'
  | 'ready_to_contact'
  | 'contacted'
  | 'replied'
  | 'qualified'
  | 'closed_won'
  | 'closed_lost'
  | 'dead'

export interface Lead {
  id: string
  company_id: string
  contact_id: string | null
  source_bot: SourceBot
  lead_type: LeadType
  status: LeadStatus
  score: number
  summary: string | null
  pain_points: string[]
  raw_payload: Record<string, unknown> | null
  owner_user_id: string | null
  created_at: string
  updated_at: string
}