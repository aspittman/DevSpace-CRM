import { z } from 'zod'

export const ingestLeadSchema = z.object({
  organization_id: z.string().uuid().optional(),

  source_bot: z.enum([
    'domain_merchant',
    'apollo_outreach',
    'devspace_outreach',
    'event_scout',
    'microgreens',
    'domain',
    'website',
    'app_store',
  ]),

  company: z.object({
    name: z.string().min(1),
    website: z.string().url().optional().nullable(),
    domain: z.string().min(1).optional().nullable(),
    industry: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
  }),

  contact: z
    .object({
      name: z.string().optional().nullable(),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      linkedin_url: z.string().url().optional().nullable(),
    })
    .optional()
    .nullable(),

  lead: z.object({
    lead_type: z.enum([
      'domain_candidate',
      'domain_outreach',
      'buyer_outreach',
      'website_outreach',
      'app_outreach',
      'event_lead',
    ]),
    score: z.number().int().min(0).max(100),
    summary: z.string().optional().nullable(),
    pain_points: z.array(z.string()).default([]),
  }),

  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type IngestLeadInput = z.infer<typeof ingestLeadSchema>