import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'
import { assembleInitialAiEdit } from '@/lib/novel-promotion/ai-editing/assemble'

export async function handleAiEditAssembleTask(job: Job<TaskJobData>) {
  const episodeId = job.data.episodeId || (typeof job.data.payload?.episodeId === 'string' ? job.data.payload.episodeId : null)
  if (!episodeId) {
    throw new Error('AI_EDIT_ASSEMBLE missing episodeId')
  }

  return await assembleInitialAiEdit({
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    episodeId,
    userId: job.data.userId,
    locale: job.data.locale,
    payload: job.data.payload || {},
  })
}
