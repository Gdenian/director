import { getServerSession } from 'next-auth/next'

import { redirect } from '@/i18n/navigation'
import { isAdminRole } from '@/lib/admin/roles'
import { authOptions } from '@/lib/auth'

import AdminConsoleClient from './AdminConsoleClient'

interface AdminPageProps {
  params: Promise<{ locale: string }>
}

interface AdminSession {
  user?: {
    role?: unknown
  }
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale } = await params
  const session = await getServerSession(authOptions) as AdminSession | null

  if (!isAdminRole(session?.user?.role)) {
    redirect({ href: '/auth/signin', locale })
  }

  return <AdminConsoleClient />
}
