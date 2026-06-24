import './globals.css'
import type { ReactNode } from 'react'
import { getCurrentProfile, isDomainPortfolioOwner } from '../lib/auth'
import LogoutButton from '../components/layout/logout-button'
import SidebarNav from '../components/layout/sidebar-nav'
import DomainPortfolioAction from '../components/layout/domain-portfolio-action'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile()
  const isAdmin = profile?.role === 'admin'
  const showDomainPortfolio = isAdmin && isDomainPortfolioOwner(profile)

  return (
    <html lang="en">
      <body>
        {profile ? (
          <div className="app-shell">
            <aside className="sidebar">
              <div className="sidebar-title">DevSpace CRM</div>

              <SidebarNav isAdmin={isAdmin} showDomainPortfolio={showDomainPortfolio} />

              <div className="sidebar-actions">
                <LogoutButton className="sidebar-logout" />
              </div>
            </aside>

            <main className="main">
              {showDomainPortfolio ? (
                <div className="global-actions">
                  <DomainPortfolioAction />
                </div>
              ) : null}

              {children}
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
