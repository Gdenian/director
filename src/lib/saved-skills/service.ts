import { prisma } from '@/lib/prisma'

export async function listSavedSkills(params: {
  userId: string
  projectId?: string | null
  limit?: number
}) {
  return prisma.savedSkill.findMany({
    where: {
      userId: params.userId,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 20,
    select: {
      id: true,
      name: true,
      summary: true,
      kind: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
    },
  })
}

export async function getSavedSkill(params: {
  userId: string
  savedSkillId: string
}) {
  return prisma.savedSkill.findFirst({
    where: {
      id: params.savedSkillId,
      userId: params.userId,
    },
    select: {
      id: true,
      name: true,
      summary: true,
      kind: true,
      data: true,
      createdAt: true,
      updatedAt: true,
      projectId: true,
    },
  })
}
