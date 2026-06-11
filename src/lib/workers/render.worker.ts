import { Worker, type Job } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { QUEUE_NAME } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress, withTaskLifecycle } from './shared'
import { renderEditorProject } from '@/lib/novel-promotion/ai-editing/render-worker'

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function readQuality(value: unknown): 'draft' | 'high' {
  return value === 'draft' ? 'draft' : 'high'
}

async function processRenderTask(job: Job<TaskJobData>) {
  await reportTaskProgress(job, 5, { stage: 'received' })
  if (job.data.type !== TASK_TYPE.EDITOR_RENDER) {
    throw new Error(`Unsupported render task type: ${job.data.type}`)
  }
  const payload = job.data.payload || {}
  const editorProjectId = typeof payload.editorProjectId === 'string' && payload.editorProjectId
    ? payload.editorProjectId
    : job.data.targetId
  if (!editorProjectId) {
    throw new Error('EDITOR_RENDER missing editorProjectId')
  }

  return await renderEditorProject({
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    episodeId: job.data.episodeId,
    userId: job.data.userId,
    locale: job.data.locale,
    editorProjectId,
    burnSubtitles: readBoolean(payload.burnSubtitles, true),
    quality: readQuality(payload.quality),
    payload,
  })
}

export function createRenderWorker() {
  return new Worker<TaskJobData>(
    QUEUE_NAME.RENDER,
    async (job) => await withTaskLifecycle(job, processRenderTask),
    {
      connection: queueRedis,
      concurrency: Number.parseInt(process.env.QUEUE_CONCURRENCY_RENDER || '1', 10) || 1,
    },
  )
}
