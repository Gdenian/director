import { describe, expect, it } from 'vitest'
import { buildExecutionPlanDraft } from '@/lib/command-center/plan-builder'
import { normalizeCommandEnvelope } from '@/lib/command-center/executor'

describe('command-center plan builder', () => {
  it('run_skill panel_variant -> builds single-step plan', () => {
    const command = normalizeCommandEnvelope({
      projectId: 'project-1',
      body: {
        commandType: 'run_skill',
        source: 'assistant-panel',
        skillId: 'panel_variant',
        episodeId: 'episode-1',
        scopeRef: 'panel:panel-1',
        input: {
          panelId: 'panel-1',
        },
      },
    })

    const plan = buildExecutionPlanDraft(command)

    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]).toMatchObject({
      skillId: 'panel_variant',
      mutationKind: 'generate',
      requiresApproval: false,
    })
    expect(plan.steps[0]?.outputArtifacts).toEqual(['panel.image'])
  })
})
