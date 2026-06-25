export const DEFAULT_DAILY_LIMIT = 25
export const APOLLO_OUTREACH_BATCH_LIMIT = 500

export function effectiveDailyLimit(serviceKey: string, dailyLimit: number | null | undefined) {
  if (serviceKey === 'apollo_outreach') return APOLLO_OUTREACH_BATCH_LIMIT
  return dailyLimit ?? DEFAULT_DAILY_LIMIT
}
