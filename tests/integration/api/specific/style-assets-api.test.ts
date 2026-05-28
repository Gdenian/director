import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-errors'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const styleServiceMock = vi.hoisted(() => ({
  ensureDefaultStyles: vi.fn(),
  listGlobalStyles: vi.fn(),
  createGlobalStyle: vi.fn(),
  updateGlobalStyle: vi.fn(),
  deleteGlobalStyle: vi.fn(),
  setDefaultStyle: vi.fn(),
}))

const prismaMock = vi.hoisted(() => ({
  prisma: {
    globalAssetFolder: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => prismaMock)
vi.mock('@/lib/styles/service', () => styleServiceMock)

const styleSummary = {
  id: 'style-1',
  userId: 'user-1',
  folderId: null,
  name: '电影写实',
  promptZh: '电影写实中文提示词',
  promptEn: 'cinematic realistic prompt',
  referenceImageUrl: 'https://example.com/ref.jpg',
  referenceImageMediaId: 'media-ref-1',
  previewImageUrl: 'https://example.com/preview.jpg',
  previewImageMediaId: 'media-preview-1',
  isSystemSeed: false,
  createdAt: '2026-05-28T00:00:00.000Z',
  updatedAt: '2026-05-28T01:00:00.000Z',
}

describe('api specific - style assets api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    styleServiceMock.ensureDefaultStyles.mockResolvedValue({ defaultStyleId: 'style-1' })
    styleServiceMock.listGlobalStyles.mockResolvedValue([styleSummary])
    styleServiceMock.createGlobalStyle.mockResolvedValue(styleSummary)
    styleServiceMock.updateGlobalStyle.mockResolvedValue({ ...styleSummary, name: '更新风格' })
    styleServiceMock.deleteGlobalStyle.mockResolvedValue({ success: true, defaultStyleId: 'style-2' })
    styleServiceMock.setDefaultStyle.mockResolvedValue({ defaultStyleId: 'style-1' })
    prismaMock.prisma.globalAssetFolder.findFirst.mockResolvedValue({ id: 'folder-1' })
  })

  it('GET /api/asset-hub/styles ensures defaults and returns safe style payloads', async () => {
    const mod = await import('@/app/api/asset-hub/styles/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/styles',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(styleServiceMock.ensureDefaultStyles).toHaveBeenCalledWith('user-1')
    expect(styleServiceMock.listGlobalStyles).toHaveBeenCalledWith('user-1', undefined)
    expect(body.defaultStyleId).toBe('style-1')
    expect(body.styles[0]).toEqual(expect.objectContaining({
      id: 'style-1',
      name: '电影写实',
      promptZh: '电影写实中文提示词',
      isDefault: true,
    }))
    expect(body.styles[0].userId).toBeUndefined()
  })

  it('POST /api/asset-hub/styles creates a user-owned style and hides userId', async () => {
    const mod = await import('@/app/api/asset-hub/styles/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/styles',
      method: 'POST',
      body: {
        name: '电影写实',
        promptZh: '电影写实中文提示词',
        promptEn: 'cinematic realistic prompt',
        referenceImageUrl: 'https://example.com/ref.jpg',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(styleServiceMock.createGlobalStyle).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      name: '电影写实',
      promptZh: '电影写实中文提示词',
      promptEn: 'cinematic realistic prompt',
      referenceImageUrl: 'https://example.com/ref.jpg',
    }))
    expect(body.style.userId).toBeUndefined()
  })

  it('PATCH /api/asset-hub/styles/[styleId] updates prompts and media fields', async () => {
    const mod = await import('@/app/api/asset-hub/styles/[styleId]/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/styles/style-1',
      method: 'PATCH',
      body: {
        name: '更新风格',
        promptZh: '更新中文提示词',
        promptEn: 'updated english prompt',
        referenceImageUrl: 'https://example.com/ref-2.jpg',
        previewImageUrl: 'https://example.com/preview-2.jpg',
      },
    })

    const res = await mod.PATCH(req, {
      params: Promise.resolve({ styleId: 'style-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(styleServiceMock.updateGlobalStyle).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      styleId: 'style-1',
      name: '更新风格',
      promptZh: '更新中文提示词',
      promptEn: 'updated english prompt',
      referenceImageUrl: 'https://example.com/ref-2.jpg',
      previewImageUrl: 'https://example.com/preview-2.jpg',
    }))
    expect(body.style.name).toBe('更新风格')
    expect(body.style.userId).toBeUndefined()
  })

  it('DELETE /api/asset-hub/styles/[styleId] delegates deletion', async () => {
    const mod = await import('@/app/api/asset-hub/styles/[styleId]/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/styles/style-1',
      method: 'DELETE',
    })

    const res = await mod.DELETE(req, {
      params: Promise.resolve({ styleId: 'style-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(styleServiceMock.deleteGlobalStyle).toHaveBeenCalledWith({
      userId: 'user-1',
      styleId: 'style-1',
    })
    expect(body).toEqual({ success: true, defaultStyleId: 'style-2' })
  })

  it('DELETE /api/asset-hub/styles/[styleId] exposes last-style errors', async () => {
    styleServiceMock.deleteGlobalStyle.mockRejectedValueOnce(new ApiError('INVALID_PARAMS', {
      code: 'STYLE_DELETE_LAST_FORBIDDEN',
      message: 'Cannot delete the last style',
    }))
    const mod = await import('@/app/api/asset-hub/styles/[styleId]/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/styles/style-1',
      method: 'DELETE',
    })

    const res = await mod.DELETE(req, {
      params: Promise.resolve({ styleId: 'style-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_PARAMS')
    expect(body.error.details.code).toBe('STYLE_DELETE_LAST_FORBIDDEN')
  })

  it('POST /api/asset-hub/styles/[styleId]/default sets the default style', async () => {
    const mod = await import('@/app/api/asset-hub/styles/[styleId]/default/route')
    const req = buildMockRequest({
      path: '/api/asset-hub/styles/style-1/default',
      method: 'POST',
    })

    const res = await mod.POST(req, {
      params: Promise.resolve({ styleId: 'style-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(styleServiceMock.setDefaultStyle).toHaveBeenCalledWith('user-1', 'style-1')
    expect(body).toEqual({ defaultStyleId: 'style-1' })
  })
})
