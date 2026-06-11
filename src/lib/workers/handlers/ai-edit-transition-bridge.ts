import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'
import { generateTransitionBridgeAsset } from '@/lib/novel-promotion/ai-editing/bridge'

export async function handleAiEditTransitionBridgeTask(job: Job<TaskJobData>) {
  const editorAssetId = typeof job.data.payload?.editorAssetId === 'string'
    ? job.data.payload.editorAssetId
    : job.data.targetId
  if (!job.data.episodeId) {
    throw new Error('AI_EDIT_TRANSITION_BRIDGE missing episodeId')
  }
  if (!editorAssetId) {
    throw new Error('AI_EDIT_TRANSITION_BRIDGE missing editorAssetId')
  }

  return await generateTransitionBridgeAsset({
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    episodeId: job.data.episodeId,
    userId: job.data.userId,
    locale: job.data.locale,
    editorAssetId,
    payload: job.data.payload || {},
  })
}
