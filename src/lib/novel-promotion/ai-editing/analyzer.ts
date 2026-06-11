import type { EditorManifestClip } from './types'

export type AnalyzerSignalType =
  | 'duration_mismatch'
  | 'very_short_clip'
  | 'very_long_clip'
  | 'continuity_gap'
  | 'duplicate_source_url'
  | 'repeated_description'

export type AnalyzerSignal = {
  type: AnalyzerSignalType
  clipId: string
  message: string
}

export function analyzeEditorManifest(input: { fps: number; clips: EditorManifestClip[] }) {
  const signals: AnalyzerSignal[] = []
  const seenUrls = new Set<string>()
  const seenDescriptions = new Set<string>()

  for (let index = 0; index < input.clips.length; index += 1) {
    const clip = input.clips[index]

    if (
      typeof clip.voiceDurationInFrames === 'number' &&
      Math.abs(clip.durationInFrames - clip.voiceDurationInFrames) > input.fps * 2
    ) {
      signals.push({
        type: 'duration_mismatch',
        clipId: clip.clipId,
        message: 'Video and voice durations differ by more than 2 seconds.',
      })
    }

    if (clip.durationInFrames < input.fps) {
      signals.push({ type: 'very_short_clip', clipId: clip.clipId, message: 'Clip is shorter than 1 second.' })
    }

    if (clip.durationInFrames > input.fps * 8) {
      signals.push({ type: 'very_long_clip', clipId: clip.clipId, message: 'Clip is longer than 8 seconds.' })
    }

    if (index < input.clips.length - 1 && clip.linkedToNextPanel !== true) {
      signals.push({
        type: 'continuity_gap',
        clipId: clip.clipId,
        message: 'Adjacent panels do not have first-last-frame continuity.',
      })
    }

    if (seenUrls.has(clip.videoUrl)) {
      signals.push({ type: 'duplicate_source_url', clipId: clip.clipId, message: 'Clip repeats a source video URL.' })
    }
    seenUrls.add(clip.videoUrl)

    const normalizedDescription = (clip.description || '').trim().toLowerCase()
    if (normalizedDescription && seenDescriptions.has(normalizedDescription)) {
      signals.push({ type: 'repeated_description', clipId: clip.clipId, message: 'Clip repeats a prior description.' })
    }
    if (normalizedDescription) {
      seenDescriptions.add(normalizedDescription)
    }
  }

  return { signals }
}
