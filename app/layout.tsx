import './globals.css'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="sidebar-title">DevSpace CRM</div>

            <div className="sidebar-section">DevSpace</div>
            <Link className="sidebar-link" href="/admin">Dashboard</Link>
            <Link className="sidebar-link" href="/admin/customers">Customers</Link>
            <Link className="sidebar-link" href="/admin/leads">Leads</Link>
            <Link className="sidebar-link" href="/admin/sales-data">Sales Data</Link>
            <Link className="sidebar-link" href="/admin/insights">Insights</Link>
            <Link className="sidebar-link" href="/admin/bot-runs">Bot Runs</Link>

            <div className="sidebar-section">Customer Portal</div>
            <Link className="sidebar-link" href="/portal">Portal Home</Link>
            <Link className="sidebar-link" href="/portal/stats">Stats</Link>
            <Link className="sidebar-link" href="/portal/leads">Leads</Link>
            <Link className="sidebar-link" href="/portal/sales-data">Sales Data</Link>
            <Link className="sidebar-link" href="/portal/campaigns">Campaigns</Link>
          </aside>

          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  )
}