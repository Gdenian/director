import type { StepResult, StopCondition, ToolSet } from 'ai'
import type { ProjectAgentStopPartData } from './types'

export const PROJECT_AGENT_MAX_STEPS = 20

type UnknownRecord = Record<string, unknown>

type TaskBoundaryDescriptor = {
  reason: 'async_task_submitted' | 'awaiting_task_terminal'
  operationId: string
  taskIds: string[]
  phases: string[]
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const normalized = readNonEmptyString(item)
    return normalized ? [normalized] : []
  })
}

function readToolResultData(output: unknown): UnknownRecord | null {
  if (!isRecord(output)) return null
  if (output.ok !== true) return null
  return isRecord(output.data) ? output.data : null
}

function detectAsyncTaskSubmission(toolName: string, output: unknown): TaskBoundaryDescriptor | null {
  const data = readToolResultData(output)
  if (!data || data.async !== true) return null

  const singleTaskId = readNonEmptyString(data.taskId)
  const batchTaskIds = readStringArray(data.taskIds)
  const taskIds = singleTaskId ? [singleTaskId] : batchTaskIds
  if (taskIds.length === 0) return null

  return {
    reason: 'async_task_submitted',
    operationId: readNonEmptyString(data.operationId) ?? toolName,
    taskIds,
    phases: [],
  }
}

function detectActiveTaskStatus(toolName: string, output: unknown): TaskBoundaryDescriptor | null {
  if (toolName !== 'get_task_status') return null
  const data = readToolResultData(output)
  if (!data || !Array.isArray(data.states)) return null

  const activeStates = data.states.flatMap((state) => {
    if (!isRecord(state)) return []
    const phase = readNonEmptyString(state.phase)
    if (phase !== 'queued' && phase !== 'processing') return []
    const taskId = readNonEmptyString(state.runningTaskId)
    return [{
      phase,
      taskId,
    }]
  })
  if (activeStates.length === 0) return null

  return {
    reason: 'awaiting_task_terminal',
    operationId: toolName,
    taskIds: activeStates.flatMap((state) => state.taskId ? [state.taskId] : []),
    phases: Array.from(new Set(activeStates.map((state) => state.phase))).sort(),
  }
}

function collectTaskBoundaryDescriptors<TOOLS extends ToolSet>(
  step: StepResult<TOOLS> | undefined,
): TaskBoundaryDescriptor[] {
  if (!step) return []
  const toolResults = Array.isArray(step.toolResults) ? step.toolResults : []
  return toolResults.flatMap((result) => {
    const asyncSubmission = detectAsyncTaskSubmission(result.toolName, result.output)
    if (asyncSubmission) return [asyncSubmission]
    const activeTaskStatus = detectActiveTaskStatus(result.toolName, result.output)
    return activeTaskStatus ? [activeTaskStatus] : []
  })
}

function mergeDescriptors(
  stepCount: number,
  descriptors: TaskBoundaryDescriptor[],
): ProjectAgentStopPartData | null {
  const firstReason = descriptors[0]?.reason
  if (!firstReason) return null
  const matching = descriptors.filter((descriptor) => descriptor.reason === firstReason)
  return firstReason === 'async_task_submitted'
    ? {
        reason: firstReason,
        stepCount,
        operationIds: Array.from(new Set(matching.map((descriptor) => descriptor.operationId))).sort(),
        taskIds: Array.from(new Set(matching.flatMap((descriptor) => descriptor.taskIds))).sort(),
      }
    : {
        reason: firstReason,
        stepCount,
        operationIds: Array.from(new Set(matching.map((descriptor) => descriptor.operationId))).sort(),
        taskIds: Array.from(new Set(matching.flatMap((descriptor) => descriptor.taskIds))).sort(),
        phases: Array.from(new Set(matching.flatMap((descriptor) => descriptor.phases))).sort(),
      }
}

export function createProjectAgentStopController<TToolSet extends ToolSet>(_tools: TToolSet) {
  void _tools
  let stopPart: ProjectAgentStopPartData | null = null
  const stopWhen: StopCondition<TToolSet> = ({ steps }) => {
    const taskBoundaryStop = mergeDescriptors(
      steps.length,
      collectTaskBoundaryDescriptors(steps[steps.length - 1]),
    )
    if (taskBoundaryStop) {
      stopPart = taskBoundaryStop
      return true
    }

    if (steps.length >= PROJECT_AGENT_MAX_STEPS) {
      stopPart = {
        reason: 'step_cap',
        stepCount: steps.length,
        maxSteps: PROJECT_AGENT_MAX_STEPS,
      }
      return true
    }
    return false
  }

  const buildStopPart = (stepCount: number): ProjectAgentStopPartData | null => {
    if (!stopPart) return null
    return stopPart.reason === 'step_cap'
      ? { ...stopPart, stepCount }
      : stopPart
  }

  return {
    stopWhen,
    buildStopPart,
  }
}
