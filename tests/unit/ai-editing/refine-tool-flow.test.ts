import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'

const editorAuthMock = vi.hoisted(() => ({
  findScopedEditorProject: vi.fn(),
}))

const manifestMock = vi.hoisted(() => ({
  buildEditorManifest: vi.fn(),
}))

const editorAssetsMock = vi.hoisted(() => ({
  listImportedEditorAssets: vi.fn(),
}))

const mediaLibraryMock = vi.hoisted(() => ({
  buildAiEditableMediaLibrary: vi.fn(),
}))

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(),
}))

const orchestratorMock = vi.hoisted(() => ({
  runEditorToolOrchestrator: vi.fn(),
}))

const versionsMock = vi.hoisted(() => ({
  createEditorVersion: vi.fn(),
}))

const prismaMock = vi.hoisted(() => ({
  videoEditorProject: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  videoEditorProjectVersion: {
    findUnique: vi.fn(),
  },
}))

vi.mock('@/lib/novel-promotion/ai-editing/editor-auth', () => editorAuthMock)
vi.mock('@/lib/novel-promotion/ai-editing/manifest', () => manifestMock)
vi.mock('@/lib/novel-promotion/ai-editing/editor-assets', () => editorAssetsMock)
vi.mock('@/lib/novel-promotion/ai-editing/media-library', () => mediaLibraryMock)
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/novel-promotion/ai-editing/tool-orchestrator', () => orchestratorMock)
vi.mock('@/lib/novel-promotion/ai-editing/versions', () => versionsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

function buildProject(overrides: Partial<VideoEditorProject> = {}): VideoEditorProject {
  return {
    id: 'editor-1',
    episodeId: 'episode-1',
    schemaVersion: '1.2',
    config: { fps: 30, width: 1920, height: 1080, videoRatio: '16:9', burnSubtitlesDefault: true },
    timeline: [{
      id: 'clip-active',
      kind: 'source',
      src: '/m/active.mp4',
      durationInFrames: 90,
      metadata: { storyboardId: 'storyboard-1', sourcePanelId: 'panel-1', source: 'panel', storyOrder: 0 },
    }],
    audioTrack: [],
    subtitleCues: [],
    editorAssets: [],
    bgmTrack: [],
    pendingVersion: null,
    ...overrides,
  }
}

describe('refineAiEdit tool flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const activeProject = buildProject()
    const editorProject = {
      id: 'editor-1',
      episodeId: 'episode-1',
      projectData: JSON.stringify(activeProject),
    }

    editorAuthMock.findScopedEditorProject.mockResolvedValue(editorProject)
    prismaMock.videoEditorProject.findFirst.mockResolvedValue(editorProject)
    prismaMock.videoEditorProject.update.mockResolvedValue({ id: 'editor-1' })
    prismaMock.videoEditorProjectVersion.findUnique.mockResolvedValue(null)
    manifestMock.buildEditorManifest.mockResolvedValue({ episodeId: 'episode-1', fps: 30, dimensions: { width: 1920, height: 1080 }, clips: [], voiceLines: [], editorAssets: [] })
    editorAssetsMock.listImportedEditorAssets.mockResolvedValue([{ id: 'asset-1', kind: 'user_import_video', status: 'completed', url: '/m/import.mp4', mediaObjectId: null, metadata: null }])
    mediaLibraryMock.buildAiEditableMediaLibrary.mockResolvedValue({ fps: 30, entries: [{ id: 'user_import_video:asset-1' }] })
    configMock.getUserModelConfig.mockResolvedValue({ analysisModel: 'llm::analysis-model' })
    versionsMock.createEditorVersion.mockResolvedValue({ id: 'version-new', createdAt: new Date('2026-06-22T10:00:00.000Z') })
  })

  it('creates a pending version from the orchestrated draft without applying it to the active timeline', async () => {
    const { refineAiEdit } = await import('@/lib/novel-promotion/ai-editing/refine')
    const orchestratedProject = buildProject({
      timeline: [{
        id: 'clip-draft',
        kind: 'source',
        src: '/m/draft.mp4',
        durationInFrames: 60,
        metadata: { storyboardId: 'storyboard-2', sourcePanelId: 'panel-2', source: 'panel', storyOrder: 0 },
      }],
    })
    orchestratorMock.runEditorToolOrchestrator.mockResolvedValue({
      project: orchestratedProject,
      operations: [{ tool: 'remove_clips', input: { clipIds: ['clip-active'] } }],
      warnings: ['tool warning'],
      changed: true,
      summary: '已加快节奏',
    })

    const result = await refineAiEdit({
      taskId: 'task-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      instruction: '节奏更快',
      payload: { targetDurationSeconds: 12, selectedClipId: 'clip-active' },
    })

    expect(editorAuthMock.findScopedEditorProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editorProjectId: undefined,
    })
    expect(manifestMock.buildEditorManifest).toHaveBeenCalledWith({ projectId: 'project-1', episodeId: 'episode-1', fps: 30 })
    expect(editorAssetsMock.listImportedEditorAssets).toHaveBeenCalledWith('editor-1')
    expect(mediaLibraryMock.buildAiEditableMediaLibrary).toHaveBeenCalledWith(expect.objectContaining({ fps: 30 }))
    expect(configMock.getUserModelConfig).toHaveBeenCalledWith('user-1')
    expect(orchestratorMock.runEditorToolOrchestrator).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({ timeline: [expect.objectContaining({ id: 'clip-active' })] }),
      media: { fps: 30, entries: [{ id: 'user_import_video:asset-1' }] },
      instruction: '节奏更快',
      userId: 'user-1',
      model: 'llm::analysis-model',
    }))
    expect(versionsMock.createEditorVersion).toHaveBeenCalledWith(expect.objectContaining({
      editorProjectId: 'editor-1',
      reason: 'ai_refine',
      summary: '已加快节奏',
      snapshot: orchestratedProject,
      diff: {
        instruction: '节奏更快',
        operations: [{ tool: 'remove_clips', input: { clipIds: ['clip-active'] } }],
        warnings: ['tool warning'],
        targetDurationSeconds: 12,
        selectedClipId: 'clip-active',
      },
      createdByTaskId: 'task-1',
    }))

    const updateCall = prismaMock.videoEditorProject.update.mock.calls[0]?.[0]
    const updatedProject = JSON.parse(updateCall.data.projectData)
    expect(updatedProject.timeline).toEqual([expect.objectContaining({ id: 'clip-active' })])
    expect(updatedProject.pendingVersion).toEqual({
      versionId: 'version-new',
      summary: '已加快节奏',
      reason: 'ai_refine',
      createdAt: '2026-06-22T10:00:00.000Z',
    })
    expect(result).toEqual({
      editorProjectId: 'editor-1',
      pendingVersionId: 'version-new',
      summary: '已加快节奏',
      warnings: ['tool warning'],
    })
  })

  it('uses an existing pending version snapshot as the orchestration base draft', async () => {
    const activeProject = buildProject({
      pendingVersion: { versionId: 'version-existing', summary: '上一版', reason: 'ai_refine', createdAt: '2026-06-20T00:00:00.000Z' },
    })
    const pendingProject = buildProject({
      timeline: [{
        id: 'clip-pending',
        kind: 'source',
        src: '/m/pending.mp4',
        durationInFrames: 80,
        metadata: { storyboardId: 'storyboard-pending', sourcePanelId: 'panel-pending', source: 'panel', storyOrder: 0 },
      }],
    })
    editorAuthMock.findScopedEditorProject.mockResolvedValue({
      id: 'editor-1',
      episodeId: 'episode-1',
      projectData: JSON.stringify(activeProject),
    })
    prismaMock.videoEditorProject.findFirst.mockResolvedValue({
      id: 'editor-1',
      episodeId: 'episode-1',
      projectData: JSON.stringify(activeProject),
    })
    prismaMock.videoEditorProjectVersion.findUnique.mockResolvedValue({
      id: 'version-existing',
      editorProjectId: 'editor-1',
      snapshotJson: JSON.stringify(pendingProject),
    })
    orchestratorMock.runEditorToolOrchestrator.mockResolvedValue({
      project: buildProject(),
      operations: [{ tool: 'set_clip_properties', input: { clipId: 'clip-pending' } }],
      warnings: [],
      changed: true,
      summary: '继续调整',
    })

    const { refineAiEdit } = await import('@/lib/novel-promotion/ai-editing/refine')
    await refineAiEdit({
      taskId: 'task-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      instruction: '继续变快',
      payload: {},
    })

    expect(prismaMock.videoEditorProjectVersion.findUnique).toHaveBeenCalledWith({
      where: { id: 'version-existing' },
    })
    expect(orchestratorMock.runEditorToolOrchestrator).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({ timeline: [expect.objectContaining({ id: 'clip-pending' })] }),
    }))
  })

  it('returns no-change without creating a version or updating the project', async () => {
    const { refineAiEdit } = await import('@/lib/novel-promotion/ai-editing/refine')
    orchestratorMock.runEditorToolOrchestrator.mockResolvedValue({
      project: buildProject(),
      operations: [],
      warnings: ['read-only plan'],
      changed: false,
      summary: '未修改时间线',
    })

    const result = await refineAiEdit({
      taskId: 'task-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      instruction: '看一下',
      payload: {},
    })

    expect(versionsMock.createEditorVersion).not.toHaveBeenCalled()
    expect(prismaMock.videoEditorProject.update).not.toHaveBeenCalled()
    expect(result).toEqual({
      editorProjectId: 'editor-1',
      pendingVersionId: '',
      summary: '未修改时间线',
      warnings: ['read-only plan', 'AI did not produce a timeline-changing edit.'],
    })
  })
})
