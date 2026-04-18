export function normalizeDomain(input?: string | null): string | null {
  if (!input) return null

  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

export function normalizeEmail(input?: string | null): string | null {
  if (!input) return null
  return input.trim().toLowerCase()
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init)
}