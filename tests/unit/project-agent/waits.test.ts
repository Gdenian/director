import { describe, expect, it } from 'vitest'
import { TASK_EVENT_TYPE } from '@/lib/task/types'
import { applyProjectAgentWaitTerminalEvent } from '@/lib/project-agent/waits'

describe('project agent waits', () => {
  it('[batch partial] -> does not resolve before all tasks are terminal', () => {
    expect(applyProjectAgentWaitTerminalEvent({
      taskId: 'task-1',
      lifecycleType: TASK_EVENT_TYPE.COMPLETED,
      taskIds: ['task-1', 'task-2'],
      terminalTaskIds: [],
      failedTaskIds: [],
    })).toEqual({
      terminalTaskIds: ['task-1'],
      failedTaskIds: [],
      terminalStatus: null,
    })
  })

  it('[batch completed] -> resolves completed after all tasks are terminal', () => {
    expect(applyProjectAgentWaitTerminalEvent({
      taskId: 'task-2',
      lifecycleType: TASK_EVENT_TYPE.COMPLETED,
      taskIds: ['task-1', 'task-2'],
      terminalTaskIds: ['task-1'],
      failedTaskIds: [],
    })).toEqual({
      terminalTaskIds: ['task-1', 'task-2'],
      failedTaskIds: [],
      terminalStatus: 'completed',
    })
  })

  it('[batch failed] -> resolves failed if any task failed', () => {
    expect(applyProjectAgentWaitTerminalEvent({
      taskId: 'task-2',
      lifecycleType: TASK_EVENT_TYPE.FAILED,
      taskIds: ['task-1', 'task-2'],
      terminalTaskIds: ['task-1'],
      failedTaskIds: [],
    })).toEqual({
      terminalTaskIds: ['task-1', 'task-2'],
      failedTaskIds: ['task-2'],
      terminalStatus: 'failed',
    })
  })
})
