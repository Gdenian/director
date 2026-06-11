import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type DurationSource = 'media_object' | 'probe' | 'fallback'

export type DurationFrameResult = {
  durationInFrames: number
  source: DurationSource
}

export async function ffprobeDurationMs(url: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      url,
    ])
    const seconds = Number.parseFloat(stdout.trim())
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return Math.round(seconds * 1000)
  } catch {
    return null
  }
}

function framesFromMs(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps))
}

export async function resolveDurationFrames(input: {
  fps: number
  mediaDurationMs?: number | null
  fallbackSeconds?: number | null
  probeUrl?: string | null
  probe?: (url: string) => Promise<number | null>
}): Promise<DurationFrameResult> {
  if (typeof input.mediaDurationMs === 'number' && input.mediaDurationMs > 0) {
    return { durationInFrames: framesFromMs(input.mediaDurationMs, input.fps), source: 'media_object' }
  }

  const probe = input.probe || ffprobeDurationMs
  if (input.probeUrl) {
    const probedMs = await probe(input.probeUrl)
    if (typeof probedMs === 'number' && probedMs > 0) {
      return { durationInFrames: framesFromMs(probedMs, input.fps), source: 'probe' }
    }
  }

  const seconds = typeof input.fallbackSeconds === 'number' && input.fallbackSeconds > 0
    ? input.fallbackSeconds
    : 3
  return { durationInFrames: Math.max(1, Math.round(seconds * input.fps)), source: 'fallback' }
}
