import { z } from 'zod'

export const ingestLeadSchema = z.object({
  source_bot: z.enum(['domain', 'website', 'app_store']),
  company: z.object({
    name: z.string().min(1),
    website: z.string().url().optional(),
    domain: z.string().min(1).optional(),
    industry: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
  contact: z
    .object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      title: z.string().optional(),
      linkedin_url: z.string().url().optional(),
    })
    .optional(),
  lead: z.object({
    lead_type: z.enum(['domain_outreach', 'website_outreach', 'app_outreach']),
    score: z.number().int().min(0).max(100),
    summary: z.string().optional(),
    pain_points: z.array(z.string()).default([]),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type IngestLeadInput = z.infer<typeof ingestLeadSchema>