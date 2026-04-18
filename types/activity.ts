export type ActivityEventType =
  | 'bot_ingested'
  | 'lead_created'
  | 'lead_updated'
  | 'status_changed'
  | 'note_added'
  | 'company_matched_existing'
  | 'contact_matched_existing'

export interface ActivityLogEntry {
  id: string
  lead_id: string | null
  event_type: ActivityEventType
  payload: Record<string, unknown> | null
  created_at: string
}