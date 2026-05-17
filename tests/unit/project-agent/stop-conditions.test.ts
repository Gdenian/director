import { describe, expect, it } from 'vitest'
import type { StepResult, ToolSet } from 'ai'
import { createProjectAgentStopController, PROJECT_AGENT_MAX_STEPS } from '@/lib/project-agent/stop-conditions'

function buildSteps(count: number): StepResult<ToolSet>[] {
  const step = {} as StepResult<ToolSet>
  return Array.from({ length: count }, () => step)
}

function buildToolResultStep(params: {
  toolName: string
  output: unknown
}): StepResult<ToolSet> {
  return {
    toolResults: [{
      type: 'tool-result',
      toolCallId: 'tool-call-1',
      toolName: params.toolName,
      input: {},
      output: params.output,
    }],
  } as unknown as StepResult<ToolSet>
}

describe('project agent stop conditions', () => {
  it('[below cap] -> stopWhen false and no stop part', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = buildSteps(PROJECT_AGENT_MAX_STEPS - 1)

    expect(controller.stopWhen({ steps })).toBe(false)
    expect(controller.buildStopPart(steps.length)).toBeNull()
  })

  it('[cap reached] -> stopWhen true and stop part returned', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = buildSteps(PROJECT_AGENT_MAX_STEPS)

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'step_cap',
      stepCount: PROJECT_AGENT_MAX_STEPS,
      maxSteps: PROJECT_AGENT_MAX_STEPS,
    })
  })

  it('[async task submitted] -> stops the loop so system monitoring owns waiting', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [
      buildToolResultStep({
        toolName: 'generate_edit_script',
        output: {
          ok: true,
          data: {
            async: true,
            taskId: 'task-1',
            status: 'processing',
          },
        },
      }),
    ]

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'async_task_submitted',
      stepCount: 1,
      operationIds: ['generate_edit_script'],
      taskIds: ['task-1'],
    })
  })

  it('[task status active] -> stops after one active status query instead of polling', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [
      buildToolResultStep({
        toolName: 'get_task_status',
        output: {
          ok: true,
          data: {
            states: [{
              targetType: 'ProjectEpisode',
              targetId: 'episode-1',
              phase: 'processing',
              runningTaskId: 'task-1',
            }],
          },
        },
      }),
    ]

    expect(controller.stopWhen({ steps })).toBe(true)
    expect(controller.buildStopPart(steps.length)).toEqual({
      reason: 'awaiting_task_terminal',
      stepCount: 1,
      operationIds: ['get_task_status'],
      taskIds: ['task-1'],
      phases: ['processing'],
    })
  })

  it('[task status terminal] -> lets the assistant summarize completed results', () => {
    const controller = createProjectAgentStopController({} as ToolSet)
    const steps = [
      buildToolResultStep({
        toolName: 'get_task_status',
        output: {
          ok: true,
          data: {
            states: [{
              targetType: 'ProjectEpisode',
              targetId: 'episode-1',
              phase: 'completed',
              runningTaskId: null,
            }],
          },
        },
      }),
    ]

    expect(controller.stopWhen({ steps })).toBe(false)
    expect(controller.buildStopPart(steps.length)).toBeNull()
  })
})
