'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function DomainPortfolioAction() {
  const pathname = usePathname()
  const isDomainPortfolioRoute = pathname === '/admin/domain-portfolio'

  return (
    <Link className="button" href={isDomainPortfolioRoute ? '/admin' : '/admin/domain-portfolio'}>
      {isDomainPortfolioRoute ? 'Dashboard' : 'Domain Portfolio'}
    </Link>
  )
}
