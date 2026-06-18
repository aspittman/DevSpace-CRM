'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabase-browser'

type LogoutButtonProps = {
  className?: string
}

export default function LogoutButton({ className = 'button' }: LogoutButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)

    const { error } = await supabaseBrowser.auth.signOut()

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={handleLogout}
    >
      {loading ? 'Logging Out...' : 'Log Out'}
    </button>
  )
}
