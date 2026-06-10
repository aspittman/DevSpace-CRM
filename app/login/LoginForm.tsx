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
    <div className="min-h-screen bg-[#050816] text-white flex items-center justify-center px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.35),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.2),_transparent_30%)]" />

      <div className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-blue-300">
            DevSpace CRM
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-white">
            Sign in
          </h1>

          <p className="mt-3 text-sm text-slate-300">
            Log in to access DevSpace CRM.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/95 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20"
              placeholder="you@devspacetechnologies.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/95 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20"
              placeholder="••••••••"
            />
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}