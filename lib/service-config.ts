import { supabaseAdmin } from './supabase-admin'

const RUN_CONFIG_KEYS = ['locations', 'max_prospects', 'min_score_to_save', 'dry_run'] as const

export function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function normalizeServiceNiche(value: unknown) {
  return stringValue(value)?.toLowerCase().replace(/\s+/g, '_') ?? null
}

export function serviceConfigJsonFromBody(body: Record<string, unknown>) {
  const config = { ...configObject(body.config_json) }

  for (const key of RUN_CONFIG_KEYS) {
    if (body[key] !== undefined) {
      config[key] = body[key]
    }
  }

  return config
}

export function numberConfig(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function booleanConfig(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return null
}

export async function findEnabledServiceConfig(
  organizationId: string,
  serviceKey: string,
  niche: string | null,
) {
  const baseQuery = supabaseAdmin
    .from('organization_services')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('service_key', serviceKey)
    .eq('is_enabled', true)

  if (niche) {
    const { data, error } = await baseQuery.eq('niche', niche).maybeSingle()
    if (error) throw error
    if (data) return data
  }

  const { data, error } = await supabaseAdmin
    .from('organization_services')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('service_key', serviceKey)
    .eq('is_enabled', true)
    .is('niche', null)
    .maybeSingle()

  if (error) throw error

  return data
}
