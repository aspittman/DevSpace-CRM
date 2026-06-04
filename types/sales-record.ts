export type SalesStatus =
  | 'open'
  | 'contacted'
  | 'qualified'
  | 'closed_won'
  | 'closed_lost'
  | 'dead'

export interface SalesRecord {
  id: string
  organization_id: string
  business_group_id: string | null
  lead_id: string | null
  customer_name: string | null
  lead_source: string | null
  service_sold: string | null
  deal_value: number | null
  status: SalesStatus
  pain_points: string[]
  notes: string | null
  contacted_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}