export type SourceBot =
  | 'domain_merchant'
  | 'apollo_outreach'
  | 'afternic_sync'
  | 'devspace_outreach'
  | 'event_scout'
  | 'microgreens'
  | 'domain'
  | 'website'
  | 'app_store'
export type LeadType =
  | 'domain_candidate'
  | 'domain_sale'
  | 'domain_outreach'
  | 'domain_buyer_outreach'
  | 'buyer_outreach'
  | 'website_outreach'
  | 'app_outreach'
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
  | 'drafted'
  | 'approved'
  | 'sent'
  | 'responded'
  | 'rejected'

export type EmailApprovalState = 'drafted' | 'approved' | 'sent' | 'responded' | 'rejected'
export type DomainLifecycleState =
  | 'candidate'
  | 'approved_to_buy'
  | 'purchased'
  | 'listed'
  | 'sold'
  | 'rejected'
  | 'expired'

export interface Lead {
  id: string
  company_id: string
  contact_id: string | null
  source_bot: SourceBot
  lead_type: LeadType
  status: LeadStatus
  email_approval_state: EmailApprovalState | null
  domain_lifecycle_state: DomainLifecycleState | null
  score: number
  summary: string | null
  pain_points: string[]
  raw_payload: Record<string, unknown> | null
  owner_user_id: string | null
  created_at: string
  updated_at: string
}
