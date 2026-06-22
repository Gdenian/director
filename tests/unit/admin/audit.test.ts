import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  adminAuditLog: {
    create: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('admin audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes an audit log with normalized fields', async () => {
    const { writeAdminAuditLog } = await import('@/lib/admin/audit')
    await writeAdminAuditLog({
      actor: { id: 'owner-1', role: 'owner' },
      action: 'user.status.update',
      targetType: 'user',
      targetId: 'user-1',
      before: { status: 'active' },
      after: { status: 'disabled' },
      reason: 'billing abuse',
      ip: '127.0.0.1',
      userAgent: 'vitest',
    })

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'owner-1',
        actorRole: 'owner',
        action: 'user.status.update',
        targetType: 'user',
        targetId: 'user-1',
        beforeJson: { status: 'active' },
        afterJson: { status: 'disabled' },
        reason: 'billing abuse',
        ip: '127.0.0.1',
        userAgent: 'vitest',
      },
    })
  })
})
