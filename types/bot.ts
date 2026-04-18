export type BotRunStatus = 'running' | 'completed' | 'failed'

export interface BotRun {
  id: string
  bot_name: string
  status: BotRunStatus
  started_at: string
  ended_at: string | null
  records_found: number
  records_inserted: number
  duplicates_detected: number
  errors: Record<string, unknown> | null
}