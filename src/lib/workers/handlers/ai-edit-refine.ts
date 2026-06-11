import type { Job } from 'bullmq'
import type { TaskJobData } from '@/lib/task/types'
import { refineAiEdit } from '@/lib/novel-promotion/ai-editing/refine'

export async function handleAiEditRefineTask(job: Job<TaskJobData>) {
  const episodeId = job.data.episodeId || (typeof job.data.payload?.episodeId === 'string' ? job.data.payload.episodeId : null)
  const instruction = typeof job.data.payload?.instruction === 'string' ? job.data.payload.instruction.trim() : ''
  if (!episodeId) {
    throw new Error('AI_EDIT_REFINE missing episodeId')
  }
  if (!instruction) {
    throw new Error('AI_EDIT_REFINE missing instruction')
  }

  return await refineAiEdit({
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    episodeId,
    userId: job.data.userId,
    locale: job.data.locale,
    instruction,
    payload: job.data.payload || {},
  })
}
