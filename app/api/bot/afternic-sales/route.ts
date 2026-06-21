import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { normalizeDomain, json } from '../../../../lib/utils'

const afternicSaleSchema = z.object({
  organization_id: z.string().uuid(),
  domain: z.string().min(1),
  buyer_name: z.string().optional().nullable(),
  deal_value: z.number().nonnegative().optional().nullable(),
  sale_price: z.number().nonnegative().optional().nullable(),
  purchase_price: z.number().nonnegative().optional().nullable(),
  status: z.string().default('sold'),
  sold_at: z.string().datetime().optional().nullable(),
  niche: z.string().optional().nullable(),
  keywords: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  raw_payload: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const expected = `Bearer ${process.env.BOT_API_SECRET}`

    if (authHeader !== expected) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = afternicSaleSchema.safeParse(body)

    if (!parsed.success) {
      return json(
        { success: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const input = parsed.data
    const domain = normalizeDomain(input.domain)
    const salePrice = input.sale_price ?? input.deal_value ?? null
    const grossProfit =
      salePrice != null && input.purchase_price != null ? salePrice - input.purchase_price : null

    if (!domain) {
      return json({ success: false, error: 'domain is required' }, { status: 400 })
    }

    const { data: matchingLeads, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('organization_id', input.organization_id)
      .contains('raw_payload', { metadata: { domain } })
      .order('created_at', { ascending: false })
      .limit(1)

    if (leadError) throw leadError

    const leadId = matchingLeads?.[0]?.id ?? null
    const closedAt = input.sold_at ?? new Date().toISOString()
    const rawPayload = {
      ...(input.raw_payload ?? {}),
      domain,
      niche: input.niche ?? null,
      keywords: input.keywords,
      sale_price: salePrice,
      purchase_price: input.purchase_price ?? null,
      gross_profit: grossProfit,
      source_bot: 'afternic_sync',
    }

    const { data: sale, error: saleError } = await supabaseAdmin
      .from('sales_records')
      .insert({
        organization_id: input.organization_id,
        lead_id: leadId,
        customer_name: input.buyer_name ?? null,
        lead_source: 'afternic_sync',
        service_sold: domain,
        domain_name: domain,
        deal_value: salePrice,
        purchase_price: input.purchase_price ?? null,
        gross_profit: grossProfit,
        status: input.status,
        notes: input.notes ?? null,
        closed_at: closedAt,
        raw_payload: rawPayload,
      })
      .select()
      .single()

    if (saleError) throw saleError

    if (leadId) {
      await supabaseAdmin
        .from('leads')
        .update({
          status: ['sold', 'closed_won', 'won'].includes(input.status.toLowerCase())
            ? 'closed_won'
            : input.status,
          domain_lifecycle_state: ['sold', 'closed_won', 'won'].includes(input.status.toLowerCase())
            ? 'sold'
            : 'listed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
    }

    return json({
      success: true,
      sale_id: sale.id,
      lead_id: leadId,
      domain,
    })
  } catch (error) {
    console.error(error)
    return json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
