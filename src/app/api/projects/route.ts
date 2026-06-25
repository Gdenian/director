import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { OperationPolicyError, operationErrorToApiPayload } from '@/lib/admin/operation-errors'
import { assertFeatureEnabled } from '@/lib/admin/policy'
import { toMoneyNumber } from '@/lib/billing/money'
import { resolveTaskLocale } from '@/lib/task/resolve-locale'
import { resolveDefaultStyleSnapshot } from '@/lib/styles/service'
import type { StyleSnapshot } from '@/lib/styles/types'
import { keyToSignedUrl } from '@/lib/storage/signed-urls'
import { resolveMediaRefFromLegacyValue } from '@/lib/media/service'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import {
  formatProjectValidationIssue,
  normalizeProjectDraft,
  validateProjectDraft,
  type ProjectDraftInput,
} from '@/lib/projects/validation'

function readProjectDraftBody(body: unknown): ProjectDraftInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { name: '' }
  }

  const payload = body as Record<string, unknown>
  return {
    name: typeof payload.name === 'string' ? payload.name : '',
    description: typeof payload.description === 'string' ? payload.description : null,
  }
}

function toProjectStyleSnapshotData(snapshot: StyleSnapshot) {
  return {
    styleAssetId: snapshot.styleAssetId,
    styleSnapshotName: snapshot.name,
    stylePromptZh: snapshot.promptZh,
    stylePromptEn: snapshot.promptEn,
    styleSnapshotUpdatedAt: new Date(snapshot.snapshotUpdatedAt),
  }
}

function safeDecodeImageUrls(raw: string | null): string[] {
  if (!raw) return []
  try {
    return decodeImageUrlsFromDb(raw, 'characterAppearance.imageUrls')
  } catch {
    return []
  }
}

async function resolveDisplayImageUrl(value: string | null): Promise<string | null> {
  if (!value) return null
  if (value.startsWith('/m/') || value.startsWith('data:')) return value

  const media = await resolveMediaRefFromLegacyValue(value)
  if (media?.url) return media.url
  if (value.startsWith('/')) return value

  return keyToSignedUrl(value) || value
}

type ProjectCharacterForPreview = {
  appearances: Array<{
    appearanceIndex: number
    imageUrl: string | null
    imageUrls: string | null
    selectedIndex: number | null
  }>
}

async function resolveMainCharacterImageUrl(characters: ProjectCharacterForPreview[]): Promise<string | null> {
  for (const character of characters) {
    const primaryAppearance = character.appearances.find((item) => item.appearanceIndex === PRIMARY_APPEARANCE_INDEX)
      || character.appearances[0]
    if (!primaryAppearance) continue

    const imageUrls = safeDecodeImageUrls(primaryAppearance.imageUrls)
    const selectedImage = typeof primaryAppearance.selectedIndex === 'number'
      ? imageUrls[primaryAppearance.selectedIndex]
      : null
    const sourceImage = selectedImage || imageUrls[0] || primaryAppearance.imageUrl
    const imageUrl = await resolveDisplayImageUrl(sourceImage)
    if (imageUrl) return imageUrl
  }

  return null
}

// GET - 获取用户的项目（支持分页和搜索）
export const GET = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 获取查询参数
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') || '12', 10)
  const search = searchParams.get('search') || ''
  const sortParam = searchParams.get('sort') || 'lastAccessedAt'
  const sortBy = sortParam === 'createdAt' ? 'createdAt' : 'lastAccessedAt'

  // 构建查询条件
  const where: Record<string, unknown> = { userId: session.user.id }

  // 如果有搜索关键词，搜索名称和描述
  // 注意：SQLite 不支持 mode: 'insensitive'，但 SQLite 的 LIKE 默认即大小写不敏感（ASCII 范围）
  if (search.trim()) {
    where.OR = [
      { name: { contains: search.trim() } },
      { description: { contains: search.trim() } }
    ]
  }

  const orderBy: Prisma.ProjectOrderByWithRelationInput[] = sortBy === 'createdAt'
    ? [{ createdAt: 'desc' }, { updatedAt: 'desc' }]
    : [{ lastAccessedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }]

  // ⚡ 并行执行：获取总数 + 分页数据
  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ])

  // 获取项目 ID 列表
  const projectIds = projects.map(p => p.id)

  // ⚡ 并行获取：费用 + 项目统计（章节数、图片数、视频数）
  const [costsByProject, novelProjects] = await Promise.all([
    // 一次性获取所有项目的费用（代替 N+1 查询）
    prisma.usageCost.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds } },
      _sum: { cost: true }
    }),
    // 一次性获取所有项目的统计数据
    prisma.novelPromotionProject.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        _count: {
          select: {
            episodes: true,
            characters: true,
            locations: true
          }
        },
        characters: {
          orderBy: { createdAt: 'asc' },
          select: {
            appearances: {
              orderBy: { appearanceIndex: 'asc' },
              select: {
                appearanceIndex: true,
                imageUrl: true,
                imageUrls: true,
                selectedIndex: true,
              },
            },
          },
        },
        episodes: {
          orderBy: { episodeNumber: 'asc' },
          select: {
            episodeNumber: true,
            novelText: true,
            storyboards: {
              select: {
                _count: {
                  select: { panels: true }
                },
                panels: {
                  where: {
                    OR: [
                      { imageUrl: { not: null } },
                      { videoUrl: { not: null } },
                    ]
                  },
                  select: {
                    imageUrl: true,
                    videoUrl: true
                  }
                }
              }
            }
          }
        }
      }
    })
  ])

  // 构建费用映射表
  const costMap = new Map(
    costsByProject.map(item => [item.projectId, toMoneyNumber(item._sum.cost)])
  )

  // 构建统计映射表 + 第一集预览
  const statsEntries = await Promise.all(
    novelProjects.map(async (np) => {
      let imageCount = 0
      let videoCount = 0
      let panelCount = 0
      for (const ep of np.episodes) {
        for (const sb of ep.storyboards) {
          panelCount += sb._count.panels
          for (const panel of sb.panels) {
            if (panel.imageUrl) imageCount++
            if (panel.videoUrl) videoCount++
          }
        }
      }
      // 取第一集的 novelText 前 100 字作为预览
      const firstEp = np.episodes[0]
      const preview = firstEp?.novelText ? firstEp.novelText.slice(0, 100) : null
      return [np.projectId, {
        episodes: np._count.episodes,
        images: imageCount,
        videos: videoCount,
        panels: panelCount,
        firstEpisodePreview: preview,
        mainCharacterImageUrl: await resolveMainCharacterImageUrl(np.characters),
      }] as const
    })
  )
  const statsMap = new Map(statsEntries)

  // 合并项目、费用与统计
  const projectsWithStats = projects.map(project => ({
    ...project,
    totalCost: costMap.get(project.id) ?? 0,
    stats: statsMap.get(project.id) ?? { episodes: 0, images: 0, videos: 0, panels: 0, firstEpisodePreview: null, mainCharacterImageUrl: null }
  }))

  return NextResponse.json({
    projects: projectsWithStats,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  })
})

// POST - 创建新项目
export const POST = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  try {
    await assertFeatureEnabled('create_work', {
      userId: session.user.id,
      role: session.user.role,
    })
  } catch (error) {
    if (error instanceof OperationPolicyError) {
      return NextResponse.json(operationErrorToApiPayload(error), { status: error.httpStatus })
    }
    throw error
  }

  const body = await request.json()
  const draft = readProjectDraftBody(body)
  const validationIssue = validateProjectDraft(draft)
  if (validationIssue) {
    const locale = resolveTaskLocale(request, body) ?? 'zh'
    throw new ApiError('INVALID_PARAMS', {
      code: validationIssue.code,
      field: validationIssue.field,
      ...(typeof validationIssue.limit === 'number' ? { limit: validationIssue.limit } : {}),
      message: formatProjectValidationIssue(validationIssue, locale),
    })
  }

  const { name, description } = normalizeProjectDraft(draft)

  // 获取用户偏好配置和默认风格快照
  const [userPreference, styleSnapshot] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: session.user.id }
    }),
    resolveDefaultStyleSnapshot(session.user.id),
  ])

  // 创建基础项目
  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      userId: session.user.id
    }
  })

  // 创建 novel-promotion 数据表，使用用户偏好作为默认值
  // 注意：不再自动创建默认剧集，由用户在选择界面决定：
  // - 手动创作 → 创建第一个空白剧集
  // - 智能导入 → AI 分析后批量创建剧集
  // 风格使用项目快照保存，避免全局风格更新影响既有项目生成结果
  await prisma.novelPromotionProject.create({
    data: {
      projectId: project.id,
      ...toProjectStyleSnapshotData(styleSnapshot),
      ...(userPreference && {
        analysisModel: userPreference.analysisModel,
        characterModel: userPreference.characterModel,
        locationModel: userPreference.locationModel,
        storyboardModel: userPreference.storyboardModel,
        editModel: userPreference.editModel,
        videoModel: userPreference.videoModel,
        audioModel: userPreference.audioModel,
        videoRatio: userPreference.videoRatio,
        ttsRate: userPreference.ttsRate
      })
    }
  })

  return NextResponse.json({ project }, { status: 201 })
})
