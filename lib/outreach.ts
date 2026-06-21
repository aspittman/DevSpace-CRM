export const outreachStatuses = [
  'drafted',
  'approved',
  'rejected',
  'sent',
  'responded',
  'positive',
  'negative',
  'bounced',
  'unsubscribed',
  'offer_received',
] as const

export type OutreachStatus = (typeof outreachStatuses)[number]

export function isOutreachStatus(value: unknown): value is OutreachStatus {
  return typeof value === 'string' && outreachStatuses.includes(value as OutreachStatus)
}

export function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, any>
}

export function leadMetadata(lead: { raw_payload?: unknown }) {
  return asRecord(asRecord(lead.raw_payload).metadata)
}

export function outreachStatus(lead: { status?: string | null; raw_payload?: unknown }) {
  const metadata = leadMetadata(lead)
  return String(metadata.outreach_status ?? lead.status ?? '').toLowerCase()
}

export function outreachSubject(lead: { raw_payload?: unknown }) {
  const metadata = leadMetadata(lead)
  return String(metadata.crm_email_subject ?? metadata.email_subject ?? '').trim()
}

export function outreachBody(lead: { raw_payload?: unknown }) {
  const metadata = leadMetadata(lead)
  return String(metadata.crm_email_body ?? metadata.email_body ?? '').trim()
}

export function outreachDomain(lead: { raw_payload?: unknown }) {
  const metadata = leadMetadata(lead)
  return String(metadata.domain ?? metadata.domain_name ?? '').trim()
}

export function scoreReasons(lead: { raw_payload?: unknown }) {
  const metadata = leadMetadata(lead)
  const value = metadata.score_reasons ?? metadata.score_reason ?? metadata.reasons

  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export function mergeLeadMetadata(lead: { raw_payload?: unknown }, metadata: Record<string, unknown>) {
  const payload = asRecord(lead.raw_payload)

  return {
    ...payload,
    metadata: {
      ...asRecord(payload.metadata),
      ...metadata,
    },
  }
}
