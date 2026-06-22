import type { AdminRole, UserStatus } from '@/lib/admin/roles'

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      image?: string | null
      role?: AdminRole
      status?: UserStatus
    }
  }

  interface User {
    id: string
    name?: string | null
    image?: string | null
    role?: AdminRole
    status?: UserStatus
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role?: AdminRole
    status?: UserStatus
  }
}
