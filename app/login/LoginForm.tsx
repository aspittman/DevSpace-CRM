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
    <div className="login-screen">
      <div className="login-electric-bg" />
      <div className="login-grid-bg" />

      <div className="login-card">
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200">
            DevSpace CRM
          </p>

          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Sign In
          </h1>

          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-300">
            Access your DevSpace dashboard with your assigned account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              placeholder="you@devspacetechnologies.com"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            disabled={loading}
            type="submit"
            className="login-button"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
