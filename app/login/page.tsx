import { redirect } from 'next/navigation'
import { getCurrentProfile } from '../../lib/auth'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const profile = await getCurrentProfile()

  if (profile?.role === 'admin') {
    redirect('/admin')
  }

  if (profile) {
    redirect('/portal')
  }

  return <LoginForm />
}
