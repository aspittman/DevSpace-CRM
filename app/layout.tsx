import './globals.css'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        <div className="min-h-screen grid grid-cols-[240px_1fr]">
          <aside className="border-r bg-white p-6">
            <div className="text-xl font-bold mb-8">DevSpace CRM</div>
            <nav className="space-y-3 text-sm">
              <Link className="block hover:underline" href="/dashboard">Dashboard</Link>
              <Link className="block hover:underline" href="/leads">Leads</Link>
              <Link className="block hover:underline" href="/companies">Companies</Link>
              <Link className="block hover:underline" href="/contacts">Contacts</Link>
              <Link className="block hover:underline" href="/bot-runs">Bot Runs</Link>
              <Link className="block hover:underline" href="/settings">Settings</Link>
            </nav>
          </aside>
          <main className="p-8">{children}</main>
        </div>
      </body>
    </html>
  )
}