'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

type SidebarLink = {
  href: string
  label: string
  tab?: string
}

const adminLinks: SidebarLink[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/insights', label: 'Insights' },
  { href: '/admin/bot-runs', label: 'Bot Runs' },
]

const portalLinks: SidebarLink[] = [
  { href: '/portal', label: 'Portal Home' },
  { href: '/portal/stats', label: 'Stats' },
  { href: '/portal/leads', label: 'Leads' },
  { href: '/portal/sales-data', label: 'Sales Data' },
  { href: '/portal/campaigns', label: 'Campaigns' },
]

const domainPortfolioLinks: SidebarLink[] = [
  { href: '/admin/domain-portfolio?tab=portfolio', label: 'Portfolio', tab: 'portfolio' },
  { href: '/admin/domain-portfolio?tab=recommendations', label: 'Recommendations', tab: 'recommendations' },
  { href: '/admin/domain-portfolio?tab=outreach', label: 'Outreach', tab: 'outreach' },
  { href: '/admin/domain-portfolio?tab=sales', label: 'Sales / Afternic', tab: 'sales' },
  { href: '/admin/domain-portfolio?tab=signals', label: 'Signals', tab: 'signals' },
  { href: '/admin/domain-portfolio?tab=sent', label: 'Sent', tab: 'sent' },
]

function isActiveLink(link: SidebarLink, pathname: string, activeTab: string) {
  if (link.tab) return link.tab === activeTab
  if (link.href === '/admin' || link.href === '/portal') return pathname === link.href
  return pathname.startsWith(link.href)
}

export default function SidebarNav({
  isAdmin,
  showDomainPortfolio,
}: {
  isAdmin: boolean
  showDomainPortfolio: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isDomainPortfolioRoute = showDomainPortfolio && pathname === '/admin/domain-portfolio'
  const activeTab = searchParams.get('tab') ?? 'portfolio'
  const links = isDomainPortfolioRoute ? domainPortfolioLinks : isAdmin ? adminLinks : portalLinks
  const sectionLabel = isAdmin ? 'DevSpace' : 'Customer Portal'

  return (
    <>
      <div className="sidebar-section">{sectionLabel}</div>
      {links.map((link) => (
        <Link
          key={link.href}
          className={`sidebar-link ${isActiveLink(link, pathname, activeTab) ? 'sidebar-link-active' : ''}`}
          href={link.href}
        >
          {link.label}
        </Link>
      ))}
    </>
  )
}
