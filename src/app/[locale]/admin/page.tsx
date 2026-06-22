import { getServerSession } from 'next-auth/next'

import { redirect } from '@/i18n/navigation'
import { isActiveUserStatus, isAdminRole, normalizeUserStatus } from '@/lib/admin/roles'
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

async function canAccessAdminConsole(session: AdminSession | null) {
  const userId = typeof session?.user?.id === 'string' ? session.user.id : null
  if (!userId) return false

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  })

  if (!user) return false
  return isAdminRole(user.role) && isActiveUserStatus(normalizeUserStatus(user.status))
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale } = await params
  const session = await getServerSession(authOptions) as AdminSession | null

  if (!await canAccessAdminConsole(session)) {
    redirect({ href: '/auth/signin', locale })
  }

  return <AdminConsoleClient />
}
