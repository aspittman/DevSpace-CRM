'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabase-browser'

export default function LoginForm() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabaseBrowser
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError) {
      console.error('Profile lookup error:', profileError)

      alert(
        `Login worked, but profile lookup failed: ${profileError.message}`
      )

      setLoading(false)
      return
    }

    if (profile.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/portal')
    }

    router.refresh()
  }

  return (
  <div className="min-h-screen bg-slate-950 text-white flex">
    <aside className="hidden lg:flex w-[42%] flex-col justify-between p-12 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <div>
        <div className="text-2xl font-bold tracking-tight">DevSpace</div>
        <div className="text-sm text-blue-300 mt-1">Technologies CRM</div>
      </div>

      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-blue-300 mb-4">
          Full Service Agency
        </p>
        <h1 className="text-5xl font-bold leading-tight mb-6">
          Manage leads, bots, customers, and growth data.
        </h1>
        <p className="text-slate-300 max-w-md">
          Internal dashboard for DevSpace customer accounts, outreach systems,
          bot activity, and sales intelligence.
        </p>
      </div>

      <div className="text-sm text-slate-400">
        Websites • Apps • SEO • Lead Generation
      </div>
    </aside>

    <main className="flex flex-1 items-center justify-center px-6 py-12 bg-[radial-gradient(circle_at_top_right,_#1e40af,_transparent_35%),#020617]">
      <div className="w-full max-w-md rounded-3xl bg-white/95 p-8 shadow-2xl border border-white/20 text-slate-950">
        <div className="mb-8">
          <p className="text-sm font-semibold text-blue-700 mb-2">
            DevSpace CRM
          </p>
          <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
          <p className="text-sm text-slate-600">
            Sign in to access your admin dashboard or customer portal.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              placeholder="you@devspacetechnologies.com"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              placeholder="••••••••"
            />
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-xl bg-blue-700 text-white py-3 font-semibold shadow-lg shadow-blue-900/20 hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
          Protected access for DevSpace admins and customer accounts.
        </p>
      </div>
    </main>
  </div>
)
}