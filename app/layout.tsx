import './globals.css'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { getCurrentProfile } from '../lib/auth'
import LogoutButton from '../components/layout/logout-button'

const adminLinks = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/sales-data', label: 'Sales Data' },
  { href: '/admin/insights', label: 'Insights' },
  { href: '/admin/bot-runs', label: 'Bot Runs' },
]

const portalLinks = [
  { href: '/portal', label: 'Portal Home' },
  { href: '/portal/stats', label: 'Stats' },
  { href: '/portal/leads', label: 'Leads' },
  { href: '/portal/sales-data', label: 'Sales Data' },
  { href: '/portal/campaigns', label: 'Campaigns' },
]

export default async function RootLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile()
  const isAdmin = profile?.role === 'admin'
  const links = isAdmin ? adminLinks : portalLinks
  const sectionLabel = isAdmin ? 'DevSpace' : 'Customer Portal'

  return (
    <html lang="en">
      <body>
        {profile ? (
          <div className="app-shell">
            <aside className="sidebar">
              <div className="sidebar-title">DevSpace CRM</div>

              <div className="sidebar-section">{sectionLabel}</div>
              {links.map((link) => (
                <Link key={link.href} className="sidebar-link" href={link.href}>
                  {link.label}
                </Link>
              ))}

              <div className="sidebar-actions">
                <LogoutButton className="sidebar-logout" />
              </div>
            </aside>

            <main className="main">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
