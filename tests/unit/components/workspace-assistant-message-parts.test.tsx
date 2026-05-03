import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AgentPlanDataCard,
  AgentStopDataCard,
  HiddenApprovalRequestDataCard,
  WorkflowStatusCard,
  WorkspaceAssistantToolCallCard,
} from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers'
import type { RunStreamView } from '@/lib/query/hooks/run-stream/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      'cards.approvalRequired': 'Approval Required',
      'cards.rejectNotePlaceholder': 'Optional rejection note',
      'cards.approve': 'Approve',
      'cards.reject': 'Reject',
      'cards.maxSteps': '已达到最大步数',
      'cards.stepUsage': '当前步数 {stepCount} / 上限 {maxSteps}',
      'cards.reason': '原因：{reason}',
      'cards.step': 'Step {current}/{total}',
      'cards.scopeEpisode': 'Episode {id}',
      'cards.screenplayPreview': 'Screenplay Preview',
      'cards.storyboardPreview': 'Storyboard Preview',
      'cards.voiceLinesLabel': 'Voice Lines',
      'cards.scopeClip': 'Clip {id}',
      'cards.panelsLabel': 'Panels {count}',
      'toolCall.title': 'Tool Call',
      'toolCall.success': 'Success',
      'toolCall.show': 'Show',
    }
    const template = translations[key] || key
    if (!values) return template
    return Object.entries(values).reduce(
      (result, [token, value]) => result.replace(`{${token}}`, String(value)),
      template,
    )
  },
}))

function buildRunStreamView(): RunStreamView {
  return {
    runState: null,
    runId: 'run-1',
    status: 'running',
    isRunning: true,
    isRecoveredRunning: false,
    isVisible: true,
    activeStepId: 'step-1',
    activeMessage: 'running',
    overallProgress: 42,
    errorMessage: '',
    summary: null,
    payload: null,
    stages: [],
    orderedSteps: [
      {
        id: 'step-1',
        attempt: 1,
        title: 'Analyze Characters',
        status: 'running',
        message: 'running',
        skillId: 'analyze-characters',
        scopeRef: 'episode:episode-1',
        stepIndex: 1,
        stepTotal: 5,
        dependsOn: [],
        blockedBy: [],
        groupId: null,
        parallelKey: null,
        retryable: false,
        textOutput: '',
        reasoningOutput: '',
        textLength: 0,
        reasoningLength: 0,
        errorMessage: '',
        updatedAt: 0,
        seqByLane: {
          text: 0,
          reasoning: 0,
        },
      },
    ],
    selectedStep: null,
    outputText: '',
    run: vi.fn(),
    retryStep: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    selectStep: vi.fn(),
  }
}

describe('workspace assistant renderers', () => {
  it('renders agent plan and status cards', () => {
    const html = renderToStaticMarkup(
      <>
        <AgentPlanDataCard
          data={{
            planId: 'plan-1',
            goal: 'Create a short script',
            summary: 'Script plan',
            requiresApproval: true,
            validation: {
              ok: true,
              issues: [],
            },
            steps: [
              {
                stepKey: 'write',
                skillId: 'screenwriting',
                operationId: 'write_screenplay',
                reason: 'Write scenes from clips',
                inputArtifacts: ['clip.split'],
                outputArtifacts: ['clip.screenplay'],
                dependsOn: [],
                requiresApproval: true,
              },
            ],
          }}
          type="data"
          name="plan"
          status={{ type: 'complete' }}
        />
        <WorkflowStatusCard
          title="Active task"
          stream={buildRunStreamView()}
          fallbackStatus="running"
        />
      </>,
    )

    expect(html).toContain('Script plan')
    expect(html).toContain('write_screenplay')
    expect(html).toContain('screenwriting')
    expect(html).toContain('Active task')
  })

  it('renders agent stop card when cap is reached', () => {
    const html = renderToStaticMarkup(
      <AgentStopDataCard
        data={{
          reason: 'step_cap',
          stepCount: 999,
          maxSteps: 999,
        }}
        type="data"
        name="agent-stop"
        status={{ type: 'complete' }}
      />,
    )

    expect(html).toContain('已达到最大步数')
    expect(html).toContain('999')
    expect(html).toContain('step_cap')
  })

  it('renders tool cards collapsed to a single summary row by default', () => {
    const html = renderToStaticMarkup(
      <WorkspaceAssistantToolCallCard
        type="tool-call"
        toolCallId="tool-1"
        toolName="get_project_context"
        args={{}}
        argsText="{}"
        result={{ projectName: 'test' }}
        status={{ type: 'complete' }}
        addResult={() => undefined}
        resume={() => undefined}
      />,
    )

    expect(html).toContain('Tool Call')
    expect(html).toContain('get_project_context')
    expect(html).toContain('Success')
    expect(html).not.toContain('Arguments')
    expect(html).not.toContain('Result')
    expect(html).not.toContain('projectName')
  })

  it('does not render inline approval request data cards', () => {
    const html = renderToStaticMarkup(
      <HiddenApprovalRequestDataCard />,
    )

    expect(html).toBe('')
  })
})
