import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type DurationSource = 'media_object' | 'probe' | 'fallback'

export type DurationFrameResult = {
  durationInFrames: number
  source: DurationSource
}

export type MediaProbeMetadata = {
  durationMs?: number
  width?: number
  height?: number
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

export async function probeMediaMetadata(
  pathOrUrl: string,
  mimeType?: string | null,
  options?: { buffer?: Buffer },
): Promise<MediaProbeMetadata> {
  if (mimeType?.startsWith('image/')) {
    try {
      const sharp = (await import('sharp')).default
      const metadata = await sharp(options?.buffer || pathOrUrl).metadata()
      return {
        ...(typeof metadata.width === 'number' ? { width: metadata.width } : {}),
        ...(typeof metadata.height === 'number' ? { height: metadata.height } : {}),
      }
    } catch {
      return {}
    }
  }

  if (mimeType?.startsWith('video/') || mimeType?.startsWith('audio/') || !mimeType) {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        pathOrUrl,
      ])
      const parsed = JSON.parse(stdout) as {
        format?: { duration?: unknown }
        streams?: Array<{ codec_type?: unknown; width?: unknown; height?: unknown }>
      }
      const seconds = typeof parsed.format?.duration === 'string'
        ? Number.parseFloat(parsed.format.duration)
        : typeof parsed.format?.duration === 'number'
          ? parsed.format.duration
          : null
      const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video')
      return {
        ...(typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
          ? { durationMs: Math.round(seconds * 1000) }
          : {}),
        ...(typeof videoStream?.width === 'number' ? { width: videoStream.width } : {}),
        ...(typeof videoStream?.height === 'number' ? { height: videoStream.height } : {}),
      }
    } catch {
      return {}
    }
  }

  return {}
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
