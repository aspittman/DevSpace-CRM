import { redirect } from 'next/navigation'
import { requireAdmin, isDomainPortfolioOwner } from '../../../lib/auth'

export default async function AdminSalesDataPage() {
  const profile = await requireAdmin()

  redirect(isDomainPortfolioOwner(profile) ? '/admin/domain-portfolio?tab=sales' : '/admin')
}
