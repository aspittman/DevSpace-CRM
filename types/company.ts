export type SourceBot = 'domain' | 'website' | 'app_store'

export interface Company {
  id: string
  name: string
  website: string | null
  domain: string | null
  industry: string | null
  city: string | null
  state: string | null
  source_bot: SourceBot | null
  created_at: string
  updated_at: string
}