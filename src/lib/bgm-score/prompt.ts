import type {
  FinalRenderClipPlan,
  FinalRenderEditScriptInput,
  FinalRenderProjectContextInput,
} from '@/lib/video-compose/final-render-plan'
import type { BgmScorePlan } from './types'

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null'
}

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildEditScriptPayload(editScript: FinalRenderEditScriptInput | null): unknown {
  if (!editScript) return null
  return {
    id: editScript.id,
    title: editScript.title,
    logline: editScript.logline ?? null,
    durationSec: editScript.durationSec,
    shots: editScript.shots.map((shot) => ({
      shotNumber: shot.shotNumber,
      durationSec: shot.durationSec,
      visualAction: shot.visualAction,
      charactersAndScene: shot.charactersAndScene ?? '',
      camera: shot.camera,
      videoPrompt: shot.videoPrompt,
      sound: shot.sound,
    })),
    videoBlocks: editScript.videoBlocks.map((block, index) => ({
      blockNumber: index + 1,
      kind: block.kind,
      shotNumbers: block.shotNumbers,
      gridMode: block.gridMode ?? null,
      reason: block.reason,
      prompt: block.prompt,
    })),
  }
}

function buildProjectContextPayload(projectContext: FinalRenderProjectContextInput | null | undefined): unknown {
  if (!projectContext) return {}
  return {
    videoRatio: normalizeString(projectContext.videoRatio) || null,
    artStyle: normalizeString(projectContext.artStyle) || null,
    artStylePrompt: normalizeString(projectContext.artStylePrompt) || null,
    visualStylePresetSource: normalizeString(projectContext.visualStylePresetSource) || null,
    visualStylePresetId: normalizeString(projectContext.visualStylePresetId) || null,
    directorStylePresetSource: normalizeString(projectContext.directorStylePresetSource) || null,
    directorStylePresetId: normalizeString(projectContext.directorStylePresetId) || null,
    directorStyleDoc: normalizeString(projectContext.directorStyleDoc) || null,
  }
}

function buildTimelinePayload(clips: readonly FinalRenderClipPlan[]): unknown {
  return clips.map((clip) => ({
    order: clip.order,
    sourceKind: clip.sourceKind,
    panelId: clip.panelId,
    groupId: clip.groupId ?? null,
    shotNumber: clip.shotNumber,
    shotNumbers: clip.shotNumbers,
    durationSeconds: clip.durationSeconds,
    visualSummary: clip.description,
    videoSoundDirection: clip.sound,
  }))
}

export function buildBgmScorePlanPrompt(input: {
  readonly editScript: FinalRenderEditScriptInput | null
  readonly projectContext?: FinalRenderProjectContextInput | null
  readonly clips: readonly FinalRenderClipPlan[]
  readonly totalDurationSeconds: number
}): string {
  return [
    'You are a professional film composer designing only the continuous BGM score for an AI-generated video.',
    'The video model already produces dialogue, character sounds, environment sounds, and event sound effects. Do not design Foley, voice, ambience replacement, literal ambience, or literal sound effects.',
    'The final output will be generated as one single complete instrumental BGM track, not separate rendered stems.',
    '',
    'First create a flexible score design, then condense that design into one excellent music-generation prompt.',
    'Use professional film-scoring concepts when useful: tempo map, meter, downbeat, cue sections, tonal center, modulation, harmonic rhythm, chord language, hit points, rests, tension and release, motif, register, orchestration, frequency roles, mix space, and restraint under dialogue.',
    'These concepts are guidance, not a fixed template. Different films need different structures: sci-fi, gangster, horror, crime, comedy, romance, drama, and action cues can organize themselves differently.',
    'Only include design sections that actually help this cue. Do not force every category to appear.',
    '',
    'Rules:',
    '1. Generate one coherent BGM cue for the full duration. The music provider will receive only finalPrompt and negativePrompt.',
    '2. scoreDesign.sections must be dynamic professional notes for the UI; use categories and titles that match the film, not a fixed list.',
    '3. virtualLayers are text-only arrangement layers that explain how the single final cue should internally behave. They are not rendered independently.',
    '4. promptSections are text-only prompt building blocks. They should explain the musical logic that finalPrompt compresses.',
    '5. finalPrompt must be a self-contained prompt for a single instrumental cinematic BGM track. It must include duration, style, emotional arc, tempo/tonality only when useful, cue sections, key hit points, arrangement/orchestration, and mix constraints.',
    '6. Leave space for video dialogue and native video sound. Avoid over-scoring and avoid full-range clutter.',
    '7. No vocals, lyrics, dialogue, Foley, footsteps, object sounds, literal ambience replacement, whoosh SFX, or standalone sound effects.',
    '8. Return strict JSON only. No markdown, no comments, no prose outside JSON.',
    '',
    'Required JSON shape:',
    safeJson({
      durationSeconds: input.totalDurationSeconds,
      creativeBrief: {
        cueType: 'continuous instrumental underscore',
        genre: 'film-specific genre, e.g. sci-fi drama / noir crime / romantic comedy',
        mood: 'main emotional direction',
        narrativeFunction: 'what the music must do for story and edit continuity',
      },
      scoreDesign: {
        overview: 'one paragraph explaining the complete score strategy',
        sections: [
          {
            category: 'dynamic category such as Cue Arc / Tempo / Tonality / Hit Point / Orchestration / Motif / Mix Space',
            title: 'specific section title',
            purpose: 'why this note matters for the cue',
            startSec: 0,
            endSec: input.totalDurationSeconds,
            content: 'professional music direction; include concrete values only when they help',
          },
        ],
      },
      virtualLayers: [
        {
          name: 'text-only internal arrangement layer name',
          purpose: 'its musical responsibility inside the one final cue',
          content: 'what it contributes and what it should avoid',
        },
      ],
      promptSections: [
        {
          title: 'prompt building block title',
          purpose: 'why this block exists',
          startSec: 0,
          endSec: input.totalDurationSeconds,
          content: 'prompt language that should be condensed into finalPrompt',
        },
      ],
      finalPrompt: 'Generate one complete continuous instrumental cinematic BGM track for 57 seconds...',
      negativePrompt: 'no vocals, no lyrics, no dialogue, no Foley, no literal sound effects, no full-range clutter',
    }),
    '',
    'Edit script JSON:',
    safeJson(buildEditScriptPayload(input.editScript)),
    '',
    'Project visual/director context JSON:',
    safeJson(buildProjectContextPayload(input.projectContext)),
    '',
    'Final rendered media timeline JSON:',
    safeJson(buildTimelinePayload(input.clips)),
  ].join('\n')
}

export function buildFinalBgmMusicPrompt(plan: BgmScorePlan): string {
  const negativePrompt = plan.negativePrompt?.trim()
  return [
    plan.finalPrompt.trim(),
    '',
    'Composer design notes to honor inside the single rendered cue:',
    `Creative brief: ${safeJson(plan.creativeBrief)}`,
    `Score design: ${safeJson(plan.scoreDesign)}`,
    `Text-only internal arrangement layers: ${safeJson(plan.virtualLayers)}`,
    `Prompt building blocks: ${safeJson(plan.promptSections)}`,
    '',
    'Render exactly one coherent instrumental BGM track, not separate stems, not a demo of isolated parts.',
    'Keep the score continuous across the full timeline while leaving space for video dialogue, native sound, and event audio.',
    'Avoid literal sound effects and avoid cluttered full-range arrangement unless the design explicitly calls for density.',
    negativePrompt ? `Negative prompt: ${negativePrompt}` : '',
  ].filter(Boolean).join('\n')
}
