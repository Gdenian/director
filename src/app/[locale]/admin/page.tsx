import { getServerSession } from 'next-auth/next'

import { redirect } from '@/i18n/navigation'
import { isActiveUserStatus, isAdminRole, normalizeUserRole, normalizeUserStatus } from '@/lib/admin/roles'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import AdminConsoleClient from './AdminConsoleClient'

interface AdminPageProps {
  params: Promise<{ locale: string }>
}

interface AdminSession {
  user?: {
    id?: unknown
    role?: unknown
  }
}

async function getAdminConsoleRole(session: AdminSession | null) {
  const userId = typeof session?.user?.id === 'string' ? session.user.id : null
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  })

  if (!user) return null
  if (!isAdminRole(user.role) || !isActiveUserStatus(normalizeUserStatus(user.status))) return null
  return normalizeUserRole(user.role)
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale } = await params
  const session = await getServerSession(authOptions) as AdminSession | null

  const currentAdminRole = await getAdminConsoleRole(session)
  if (!currentAdminRole) {
    redirect({ href: '/auth/signin', locale })
    return null
  }

  return <AdminConsoleClient currentAdminRole={currentAdminRole} />
}
