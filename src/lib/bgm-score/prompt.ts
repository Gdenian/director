import type {
  FinalRenderClipPlan,
  FinalRenderEditScriptInput,
  FinalRenderProjectContextInput,
} from '@/lib/video-compose/final-render-plan'
import { BGM_STEM_ROLES } from './types'

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
    'The video model already produces dialogue, character sounds, environment sounds, and event sound effects. Do not design Foley, voice, ambience replacement, or literal sound effects.',
    'Your task is to create a structured multi-stem BGM plan. The final BGM must be continuous across the whole timeline, but internally split into isolated musical stems.',
    '',
    'Allowed stem roles:',
    '- atmosphere: continuous musical bed, drones, pads, long strings, air-like score texture.',
    '- pulse: rhythmic propulsion, ticking, ostinato, percussion pulse, repeated musical motion.',
    '- low_end: sub, bass swells, low brass/strings, weight, danger, pressure.',
    '- harmony: chordal emotional direction, strings/brass/synth/piano harmonic color.',
    '- motif: sparse recognizable short theme or melodic identity.',
    '- music_transition: musical risers, crescendos, swells, cadences, score hits, rests tied to edit or emotion transitions.',
    '',
    'Rules:',
    '1. Choose only necessary stems from the allowed roles. Use 2-4 stems by default; 1 is acceptable for minimal scenes; 5-6 only when strongly justified.',
    '2. Do not duplicate roles. Every stem must have a distinct musical function and reason.',
    '3. Each stem prompt must ask for an isolated stem only, not a full soundtrack.',
    '4. Each stem prompt must include the same duration, mood, tempo/key when selected, and must leave room for video dialogue and native sound.',
    '5. Do not include vocals, lyrics, Foley, literal ambience, whoosh SFX, object sounds, footsteps, or dialogue.',
    '6. Return strict JSON only. No markdown, no comments, no prose outside JSON.',
    '',
    'Required JSON shape:',
    safeJson({
      durationSeconds: input.totalDurationSeconds,
      global: {
        mood: 'string',
        genre: 'string',
        bpm: 72,
        key: 'D minor',
        intensityCurve: [{ timeSec: 0, intensity: 20 }],
      },
      stems: [{
        role: BGM_STEM_ROLES[0],
        reason: 'string',
        startSec: 0,
        durationSec: input.totalDurationSeconds,
        gainDb: -10,
        fadeInSec: 1,
        fadeOutSec: 2,
        density: 20,
        tension: 40,
        brightness: 30,
        motion: 25,
        prompt: 'Generate an isolated cinematic atmosphere music stem only, not a full soundtrack...',
        negativePrompt: 'no vocals, no lyrics, no dialogue, no foley, no literal sound effects, no full mix',
      }],
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
