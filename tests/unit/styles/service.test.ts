import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../helpers/prisma'
import { resetSystemState } from '../../helpers/db-reset'
import {
  createFixtureNovelProject,
  createFixtureProject,
  createFixtureUser,
} from '../../helpers/fixtures'
import {
  buildStyleSnapshot,
  deleteGlobalStyle,
  ensureDefaultStyles,
  isGlobalStyleStale,
  resolveDefaultStyleSnapshot,
  resolveEffectiveStyleSnapshot,
  resolveStyleSnapshotState,
  resolveStylePrompt,
} from '@/lib/styles/service'
import type { StyleSnapshot } from '@/lib/styles/types'

async function createStyle(
  userId: string,
  overrides: Partial<{
    name: string
    promptZh: string
    promptEn: string | null
    isSystemSeed: boolean
    createdAt: Date
  }> = {},
) {
  return prisma.globalStyle.create({
    data: {
      userId,
      name: overrides.name ?? '测试风格',
      promptZh: overrides.promptZh ?? '测试中文风格提示词',
      promptEn: overrides.promptEn ?? 'test english style prompt',
      isSystemSeed: overrides.isSystemSeed ?? false,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  })
}

describe('styles/service', () => {
  beforeEach(async () => {
    await resetSystemState()
  })

  it('ensureDefaultStyles creates seed styles and stores UserPreference.defaultStyleId', async () => {
    const user = await createFixtureUser()

    const result = await ensureDefaultStyles(user.id)

    const styles = await prisma.globalStyle.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(styles).toHaveLength(4)
    expect(styles.map((style) => style.name)).toEqual(expect.arrayContaining(['漫画风', '精致国漫', '日系动漫风', '真人风格']))
    expect(styles.every((style) => style.isSystemSeed)).toBe(true)
    const defaultStyle = styles.find((style) => style.id === result.defaultStyleId)
    expect(defaultStyle).toMatchObject({
      name: '漫画风',
      promptZh: '日式动漫风格',
      promptEn: 'Japanese anime style',
    })

    const preference = await prisma.userPreference.findUnique({ where: { userId: user.id } })
    expect(preference?.defaultStyleId).toBe(defaultStyle?.id)
  })

  it('ensureDefaultStyles reuses an existing default style', async () => {
    const user = await createFixtureUser()
    const style = await createStyle(user.id, { name: '已有默认风格' })
    await prisma.userPreference.create({
      data: {
        userId: user.id,
        defaultStyleId: style.id,
      },
    })

    const result = await ensureDefaultStyles(user.id)

    const styles = await prisma.globalStyle.findMany({ where: { userId: user.id } })
    expect(styles).toHaveLength(1)
    expect(result.defaultStyleId).toBe(style.id)
  })

  it('ensureDefaultStyles repairs an invalid defaultStyleId using the earliest existing style', async () => {
    const user = await createFixtureUser()
    const existing = await createStyle(user.id, {
      name: '已有风格',
      createdAt: new Date('2026-05-28T00:00:00.000Z'),
    })
    await createStyle(user.id, {
      name: '较晚风格',
      createdAt: new Date('2026-05-28T00:01:00.000Z'),
    })
    await prisma.userPreference.create({
      data: {
        userId: user.id,
        defaultStyleId: 'missing-style-id',
      },
    })

    const result = await ensureDefaultStyles(user.id)

    const styles = await prisma.globalStyle.findMany({ where: { userId: user.id } })
    const preference = await prisma.userPreference.findUnique({ where: { userId: user.id } })
    expect(styles).toHaveLength(2)
    expect(result.defaultStyleId).toBe(existing.id)
    expect(preference?.defaultStyleId).toBe(existing.id)
  })

  it('resolveDefaultStyleSnapshot returns the default global style snapshot', async () => {
    const user = await createFixtureUser()
    const style = await createStyle(user.id, {
      name: '默认写实',
      promptZh: '默认中文提示词',
      promptEn: 'default english prompt',
    })
    await prisma.userPreference.create({
      data: {
        userId: user.id,
        defaultStyleId: style.id,
      },
    })

    await expect(resolveDefaultStyleSnapshot(user.id)).resolves.toEqual({
      styleAssetId: style.id,
      name: '默认写实',
      promptZh: '默认中文提示词',
      promptEn: 'default english prompt',
      snapshotUpdatedAt: style.updatedAt.toISOString(),
    })
  })

  it('buildStyleSnapshot copies id, name, prompts, and updatedAt', () => {
    const updatedAt = new Date('2026-05-28T10:20:30.000Z')

    const snapshot = buildStyleSnapshot({
      id: 'style-1',
      name: '漫画风',
      promptZh: '中文提示词',
      promptEn: 'english prompt',
      updatedAt,
    })

    expect(snapshot).toEqual({
      styleAssetId: 'style-1',
      name: '漫画风',
      promptZh: '中文提示词',
      promptEn: 'english prompt',
      snapshotUpdatedAt: updatedAt.toISOString(),
    })
  })

  it('resolveStylePrompt returns promptZh for zh locale', () => {
    expect(resolveStylePrompt(makeSnapshot({ promptZh: '中文提示词', promptEn: 'english prompt' }), 'zh')).toBe(
      '中文提示词',
    )
  })

  it('resolveStylePrompt returns promptEn for en locale when present', () => {
    expect(resolveStylePrompt(makeSnapshot({ promptZh: '中文提示词', promptEn: 'english prompt' }), 'en')).toBe(
      'english prompt',
    )
  })

  it('resolveStylePrompt falls back to promptZh for en locale when promptEn is empty', () => {
    expect(resolveStylePrompt(makeSnapshot({ promptZh: '中文提示词', promptEn: '' }), 'en')).toBe('中文提示词')
  })

  it('deleteGlobalStyle forbids deleting the last style', async () => {
    const user = await createFixtureUser()
    const style = await createStyle(user.id)
    await prisma.userPreference.create({
      data: {
        userId: user.id,
        defaultStyleId: style.id,
      },
    })

    await expect(deleteGlobalStyle({ userId: user.id, styleId: style.id })).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      details: { code: 'STYLE_DELETE_LAST_FORBIDDEN' },
    })
  })

  it('deleteGlobalStyle switches defaultStyleId to the earliest remaining style', async () => {
    const user = await createFixtureUser()
    const style1 = await createStyle(user.id, {
      name: '默认风格',
      createdAt: new Date('2026-05-28T00:00:00.000Z'),
    })
    const style2 = await createStyle(user.id, {
      name: '最早剩余风格',
      createdAt: new Date('2026-05-28T00:01:00.000Z'),
    })
    await createStyle(user.id, {
      name: '较晚剩余风格',
      createdAt: new Date('2026-05-28T00:02:00.000Z'),
    })
    await prisma.userPreference.create({
      data: {
        userId: user.id,
        defaultStyleId: style1.id,
      },
    })

    const result = await deleteGlobalStyle({ userId: user.id, styleId: style1.id })

    const preference = await prisma.userPreference.findUnique({ where: { userId: user.id } })
    expect(result).toEqual({ success: true, defaultStyleId: style2.id })
    expect(preference?.defaultStyleId).toBe(style2.id)
    await expect(prisma.globalStyle.findUnique({ where: { id: style1.id } })).resolves.toBeNull()
  })

  it('isGlobalStyleStale returns true only when updatedAt is newer than snapshotUpdatedAt', () => {
    const snapshot = makeSnapshot({ snapshotUpdatedAt: '2026-05-28T10:00:00.000Z' })

    expect(isGlobalStyleStale(snapshot, '2026-05-28T10:00:00.000Z')).toBe(false)
    expect(isGlobalStyleStale(snapshot, new Date('2026-05-28T09:59:59.999Z'))).toBe(false)
    expect(isGlobalStyleStale(snapshot, new Date('2026-05-28T10:00:00.001Z'))).toBe(true)
  })

  it('resolveStyleSnapshotState returns stale message when global style is newer than project snapshot', async () => {
    const user = await createFixtureUser()
    const style = await createStyle(user.id, { name: '电影写实' })
    const olderSnapshotTime = new Date(style.updatedAt.getTime() - 1000)

    await expect(
      resolveStyleSnapshotState(user.id, {
        styleAssetId: style.id,
        styleSnapshotName: '电影写实',
        stylePromptZh: '旧中文提示词',
        stylePromptEn: 'old english prompt',
        styleSnapshotUpdatedAt: olderSnapshotTime,
      }),
    ).resolves.toEqual({
      styleSnapshot: {
        styleAssetId: style.id,
        name: '电影写实',
        promptZh: '旧中文提示词',
        promptEn: 'old english prompt',
        snapshotUpdatedAt: olderSnapshotTime.toISOString(),
      },
      styleSnapshotStale: true,
      styleSnapshotStaleMessage: '该风格已有更新，可重新选择刷新状态',
    })
  })

  it('resolveEffectiveStyleSnapshot prefers asset snapshot and falls back to project snapshot', async () => {
    const user = await createFixtureUser()
    const project = await createFixtureProject(user.id)
    await createFixtureNovelProject(project.id)
    await prisma.novelPromotionProject.update({
      where: { projectId: project.id },
      data: {
        styleAssetId: 'project-style-id',
        styleSnapshotName: '项目风格',
        stylePromptZh: '项目中文提示词',
        stylePromptEn: 'project english prompt',
        styleSnapshotUpdatedAt: new Date('2026-05-28T09:00:00.000Z'),
      },
    })

    const assetSnapshot = {
      styleAssetId: 'asset-style-id',
      styleSnapshotName: '资产风格',
      stylePromptZh: '资产中文提示词',
      stylePromptEn: 'asset english prompt',
      styleSnapshotUpdatedAt: new Date('2026-05-28T10:00:00.000Z'),
    }

    await expect(
      resolveEffectiveStyleSnapshot({
        projectId: project.id,
        assetSnapshot,
      }),
    ).resolves.toEqual({
      styleAssetId: 'asset-style-id',
      name: '资产风格',
      promptZh: '资产中文提示词',
      promptEn: 'asset english prompt',
      snapshotUpdatedAt: '2026-05-28T10:00:00.000Z',
    })

    await expect(
      resolveEffectiveStyleSnapshot({
        projectId: project.id,
        assetSnapshot: null,
      }),
    ).resolves.toEqual({
      styleAssetId: 'project-style-id',
      name: '项目风格',
      promptZh: '项目中文提示词',
      promptEn: 'project english prompt',
      snapshotUpdatedAt: '2026-05-28T09:00:00.000Z',
    })
  })
})

function makeSnapshot(overrides: Partial<StyleSnapshot> = {}): StyleSnapshot {
  return {
    styleAssetId: 'style-1',
    name: '测试风格',
    promptZh: '测试中文提示词',
    promptEn: 'test english style prompt',
    snapshotUpdatedAt: '2026-05-28T00:00:00.000Z',
    ...overrides,
  }
}
