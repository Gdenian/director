import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { getUserModelConfig } from '@/lib/config-service'
import { migrateProjectData } from '@/features/video-editor/utils/migration'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { findScopedEditorProject } from './editor-auth'
import { buildEditorManifest } from './manifest'
import { listImportedEditorAssets } from './editor-assets'
import { buildAiEditableMediaLibrary } from './media-library'
import { runEditorToolOrchestrator } from './tool-orchestrator'
import { createEditorVersion } from './versions'

export type RefineResult = {
  editorProjectId: string
  pendingVersionId: string
  summary: string
  warnings: string[]
}

type RefineIntent = {
  targetDurationSeconds?: number
  selectedClipId?: string
}

type RefineBaseProject = {
  project: VideoEditorProject
  baseSource: 'active' | 'pending'
  baseVersionId?: string
}

export async function refineAiEdit(input: {
  taskId: string
  projectId: string
  episodeId: string
  userId: string
  locale: Locale
  instruction: string
  payload: Record<string, unknown>
}): Promise<RefineResult> {
  void input.locale

  const editorProjectId = typeof input.payload.editorProjectId === 'string'
    ? input.payload.editorProjectId.trim()
    : undefined
  const editorProject = await findScopedEditorProject({
    projectId: input.projectId,
    episodeId: input.episodeId,
    editorProjectId,
  })
  if (!editorProject) {
    throw new Error('AI_EDIT_REFINE_EDITOR_PROJECT_NOT_FOUND')
  }

  const activeProject = migrateProjectData(JSON.parse(editorProject.projectData))
  const base = await resolveBaseProject(editorProject.id, activeProject)
  const refineIntent = buildRefineIntent(input.payload)
  const manifest = await buildEditorManifest({
    projectId: input.projectId,
    episodeId: input.episodeId,
    fps: base.project.config.fps,
  })
  const importedAssets = await listImportedEditorAssets(editorProject.id)
  const media = await buildAiEditableMediaLibrary({
    fps: base.project.config.fps,
    manifest,
    importedAssets,
  })
  const userConfig = await getUserModelConfig(input.userId)
  const analysisModel = userConfig.analysisModel?.trim()
  if (!analysisModel) {
    throw new Error('AI_EDIT_REFINE_ANALYSIS_MODEL_NOT_CONFIGURED')
  }

  const orchestrated = await runEditorToolOrchestrator({
    project: base.project,
    media,
    instruction: input.instruction,
    intent: refineIntent,
    userId: input.userId,
    model: analysisModel,
  })
  const summary = orchestrated.summary || `根据指令准备剪辑微调：${input.instruction}`

  if (!orchestrated.changed) {
    return {
      editorProjectId: editorProject.id,
      pendingVersionId: '',
      summary,
      warnings: [...orchestrated.warnings, 'AI did not produce a timeline-changing edit.'],
    }
  }

  const version = await createEditorVersion({
    editorProjectId: editorProject.id,
    reason: 'ai_refine',
    summary,
    snapshot: orchestrated.project,
    diff: buildRefineDiff(input.instruction, orchestrated.operations, orchestrated.warnings, refineIntent, base),
    createdByTaskId: input.taskId,
  })

  activeProject.pendingVersion = {
    versionId: version.id,
    summary,
    reason: 'ai_refine',
    createdAt: version.createdAt.toISOString(),
  }

  await prisma.videoEditorProject.update({
    where: { id: editorProject.id },
    data: {
      projectData: JSON.stringify(activeProject),
      updatedAt: new Date(),
    },
  })

  return {
    editorProjectId: editorProject.id,
    pendingVersionId: version.id,
    summary,
    warnings: orchestrated.warnings,
  }
}

async function resolveBaseProject(editorProjectId: string, activeProject: VideoEditorProject): Promise<RefineBaseProject> {
  const pendingVersionId = activeProject.pendingVersion?.versionId
  if (!pendingVersionId) return { project: activeProject, baseSource: 'active' }

  const pendingVersion = await prisma.videoEditorProjectVersion.findUnique({
    where: { id: pendingVersionId },
  })
  if (!pendingVersion || pendingVersion.editorProjectId !== editorProjectId) {
    return { project: activeProject, baseSource: 'active' }
  }

  return {
    project: migrateProjectData(JSON.parse(pendingVersion.snapshotJson)),
    baseSource: 'pending',
    baseVersionId: pendingVersion.id,
  }
}

function buildRefineDiff(
  instruction: string,
  operations: unknown[],
  warnings: string[],
  intent: RefineIntent,
  base: RefineBaseProject,
) {
  return {
    instruction,
    operations,
    warnings,
    baseSource: base.baseSource,
    ...(base.baseVersionId ? { baseVersionId: base.baseVersionId } : {}),
    ...(typeof intent.targetDurationSeconds === 'number' ? { targetDurationSeconds: intent.targetDurationSeconds } : {}),
    ...(typeof intent.selectedClipId === 'string' ? { selectedClipId: intent.selectedClipId } : {}),
  }
}

function buildRefineIntent(payload: Record<string, unknown>): RefineIntent {
  return {
    ...(typeof payload.targetDurationSeconds === 'number' ? { targetDurationSeconds: payload.targetDurationSeconds } : {}),
    ...(typeof payload.selectedClipId === 'string' ? { selectedClipId: payload.selectedClipId } : {}),
  }
}
