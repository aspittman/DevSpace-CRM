export type ActivityEventType =
  | 'bot_ingested'
  | 'lead_created'
  | 'lead_updated'
  | 'outreach_draft_edited'
  | 'outreach_reviewed'
  | 'outreach_sent'
  | 'outreach_reply'
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
