import { ARTIFACT_TYPES } from '@/lib/artifact-system/types'
import { getSkillPackage } from '@/lib/skill-system/catalog'
import type { CommandSkillId, SkillDefinition } from '@/lib/skill-system/types'
import type { CommandEnvelope, ExecutionPlanDraft, PlanStep } from './types'

const LEGACY_COMMAND_SKILLS: Record<Exclude<CommandSkillId, Parameters<typeof getSkillPackage>[0]>, SkillDefinition> = {
  insert_panel: {
    id: 'insert_panel',
    name: 'Insert Panel',
    summary: 'Insert a new storyboard panel into an existing panel sequence.',
    riskLevel: 'medium',
    requiresApproval: true,
    inputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PANEL_SET],
    outputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PANEL_SET, ARTIFACT_TYPES.PANEL_PROMPT],
    invalidates: [ARTIFACT_TYPES.PANEL_IMAGE, ARTIFACT_TYPES.PANEL_VIDEO, ARTIFACT_TYPES.VOICE_LINES],
    mutationKind: 'generate',
  },
  panel_variant: {
    id: 'panel_variant',
    name: 'Panel Variant',
    summary: 'Generate a new image variant for an existing storyboard panel.',
    riskLevel: 'low',
    requiresApproval: false,
    inputArtifacts: [ARTIFACT_TYPES.PANEL_IMAGE],
    outputArtifacts: [ARTIFACT_TYPES.PANEL_IMAGE],
    invalidates: [ARTIFACT_TYPES.PANEL_VIDEO],
    mutationKind: 'generate',
  },
  regenerate_storyboard_text: {
    id: 'regenerate_storyboard_text',
    name: 'Regenerate Storyboard Text',
    summary: 'Regenerate text content for an existing storyboard item.',
    riskLevel: 'medium',
    requiresApproval: true,
    inputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PANEL_SET],
    outputArtifacts: [ARTIFACT_TYPES.STORYBOARD_PANEL_SET],
    invalidates: [ARTIFACT_TYPES.PANEL_PROMPT, ARTIFACT_TYPES.PANEL_IMAGE, ARTIFACT_TYPES.PANEL_VIDEO, ARTIFACT_TYPES.VOICE_LINES],
    mutationKind: 'generate',
  },
  modify_shot_prompt: {
    id: 'modify_shot_prompt',
    name: 'Modify Shot Prompt',
    summary: 'Modify the prompt attached to a storyboard panel shot.',
    riskLevel: 'medium',
    requiresApproval: false,
    inputArtifacts: [ARTIFACT_TYPES.PANEL_PROMPT],
    outputArtifacts: [ARTIFACT_TYPES.PANEL_PROMPT],
    invalidates: [ARTIFACT_TYPES.PANEL_IMAGE, ARTIFACT_TYPES.PANEL_VIDEO],
    mutationKind: 'update',
  },
}

function getPlanSkillDefinition(skillId: CommandSkillId): SkillDefinition {
  if (skillId in LEGACY_COMMAND_SKILLS) {
    return LEGACY_COMMAND_SKILLS[skillId as keyof typeof LEGACY_COMMAND_SKILLS]
  }

  const skill = getSkillPackage(skillId as Parameters<typeof getSkillPackage>[0])
  return {
    id: skill.metadata.id,
    name: skill.metadata.name,
    summary: skill.metadata.summary,
    riskLevel: skill.metadata.riskLevel,
    requiresApproval: skill.effects.requiresApproval,
    inputArtifacts: skill.interface.inputArtifacts,
    outputArtifacts: skill.interface.outputArtifacts,
    invalidates: skill.effects.invalidates,
    mutationKind: skill.effects.mutationKind,
  }
}

function buildPlanStep(skillId: CommandSkillId, orderIndex: number, dependsOn: string[]): PlanStep {
  const skill = getPlanSkillDefinition(skillId)
  return {
    stepKey: skill.id,
    skillId: skill.id,
    title: skill.name,
    orderIndex,
    inputArtifacts: skill.inputArtifacts,
    outputArtifacts: skill.outputArtifacts,
    invalidates: skill.invalidates,
    mutationKind: skill.mutationKind,
    riskLevel: skill.riskLevel,
    requiresApproval: skill.requiresApproval,
    dependsOn,
  }
}

export function buildExecutionPlanDraft(command: CommandEnvelope): ExecutionPlanDraft {
  const step = buildPlanStep(command.skillId, 0, [])
  return {
    summary: getPlanSkillDefinition(command.skillId).summary,
    requiresApproval: step.requiresApproval,
    riskSummary: {
      highestRiskLevel: step.riskLevel,
      reasons: step.invalidates.map((artifactType) => `${step.skillId} invalidates ${artifactType}`),
    },
    steps: [step],
  }
}
