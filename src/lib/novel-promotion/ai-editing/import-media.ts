import { lookup } from 'node:dns/promises'
import net from 'node:net'
import path from 'node:path'
import type { VideoEditorAsset } from '@prisma/client'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { generateUniqueKey, getSignedObjectUrl, toFetchableUrl, uploadObject } from '@/lib/storage'
import {
  completeEditorAsset,
  createPendingEditorAsset,
  failEditorAsset,
  type EditorAssetKind,
} from './editor-assets'
import { probeMediaMetadata } from './media-probe'

export type EditorImportAssetKind = Extract<
  EditorAssetKind,
  'user_import_video' | 'user_import_audio' | 'user_import_image'
>

export type EditorImportMetadataInput = {
  label?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  durationMs?: number | null
  width?: number | null
  height?: number | null
}

const MIME_TO_KIND: Record<string, EditorImportAssetKind> = {
  'video/mp4': 'user_import_video',
  'video/webm': 'user_import_video',
  'video/quicktime': 'user_import_video',
  'audio/mpeg': 'user_import_audio',
  'audio/mp4': 'user_import_audio',
  'audio/wav': 'user_import_audio',
  'audio/ogg': 'user_import_audio',
  'image/png': 'user_import_image',
  'image/jpeg': 'user_import_image',
  'image/webp': 'user_import_image',
}

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

const IMPORT_TIMEOUT_MS = 30_000
const MAX_IMPORT_BYTES_BY_KIND: Record<EditorImportAssetKind, number> = {
  user_import_video: 500 * 1024 * 1024,
  user_import_audio: 100 * 1024 * 1024,
  user_import_image: 25 * 1024 * 1024,
}

export class EditorImportError extends Error {
  constructor(public code:
    | 'EDITOR_IMPORT_UNSUPPORTED_MIME'
    | 'EDITOR_IMPORT_URL_INVALID'
    | 'EDITOR_IMPORT_DOWNLOAD_FAILED'
    | 'EDITOR_IMPORT_TIMEOUT'
    | 'EDITOR_IMPORT_TOO_LARGE'
  ) {
    super(code)
    this.name = 'EditorImportError'
  }
}

export function classifyEditorImportMimeType(mimeType: string | null | undefined): EditorImportAssetKind | null {
  if (!mimeType) return null
  return MIME_TO_KIND[mimeType.trim().toLowerCase()] || null
}

export function normalizeEditorImportMetadata(input: EditorImportMetadataInput) {
  return {
    label: input.label?.trim() || '导入素材',
    ...(typeof input.mimeType === 'string' && input.mimeType.trim() ? { mimeType: input.mimeType.trim() } : {}),
    ...numericField('sizeBytes', input.sizeBytes),
    ...numericField('durationMs', input.durationMs),
    ...numericField('width', input.width),
    ...numericField('height', input.height),
  }
}

export async function importEditorMediaFromBuffer(input: {
  editorProjectId: string
  episodeId: string
  fileName?: string | null
  mimeType: string | null
  buffer: Buffer
  label?: string | null
}): Promise<VideoEditorAsset> {
  const kind = requireImportKind(input.mimeType)
  const mimeType = input.mimeType?.trim().toLowerCase() || ''
  assertImportSizeAllowed(kind, input.buffer.length)
  const asset = await createPendingEditorAsset({
    editorProjectId: input.editorProjectId,
    episodeId: input.episodeId,
    kind,
    sourceClipIds: [],
    sourcePanelIds: [],
    metadata: normalizeEditorImportMetadata({
      label: input.label,
      mimeType,
      sizeBytes: input.buffer.length,
    }),
  })

  try {
    const key = generateImportStorageKey(input.editorProjectId, input.fileName, mimeType)
    const uploadedKey = await uploadObject(input.buffer, key, 1, mimeType)
    return await completeImportedAsset({
      assetId: asset.id,
      storageKey: uploadedKey,
      mimeType,
      sizeBytes: input.buffer.length,
      label: input.label,
      buffer: input.buffer,
    })
  } catch (error) {
    await failEditorAsset({ id: asset.id, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

export async function importEditorMediaFromUrl(input: {
  editorProjectId: string
  episodeId: string
  url: string
  mimeType: string | null
  label?: string | null
}): Promise<VideoEditorAsset> {
  const kind = requireImportKind(input.mimeType)
  const sourceUrl = await assertSafeEditorImportUrl(input.url)
  const mimeType = input.mimeType?.trim().toLowerCase() || ''
  const asset = await createPendingEditorAsset({
    editorProjectId: input.editorProjectId,
    episodeId: input.episodeId,
    kind,
    sourceClipIds: [],
    sourcePanelIds: [],
    metadata: normalizeEditorImportMetadata({
      label: input.label,
      mimeType,
    }),
  })

  try {
    const buffer = await downloadEditorImport(sourceUrl, MAX_IMPORT_BYTES_BY_KIND[kind])
    const key = generateImportStorageKey(input.editorProjectId, null, mimeType)
    const uploadedKey = await uploadObject(buffer, key, 1, mimeType)
    return await completeImportedAsset({
      assetId: asset.id,
      storageKey: uploadedKey,
      mimeType,
      sizeBytes: buffer.length,
      label: input.label,
      buffer,
    })
  } catch (error) {
    const importError = normalizeImportDownloadError(error)
    await failEditorAsset({ id: asset.id, error: importError.message })
    throw importError
  }
}

async function downloadEditorImport(sourceUrl: string, maxBytes: number): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS)
  try {
    const response = await fetch(toFetchableUrl(sourceUrl), {
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.status >= 300 && response.status < 400) {
      throw new EditorImportError('EDITOR_IMPORT_URL_INVALID')
    }
    if (!response.ok) {
      throw new EditorImportError('EDITOR_IMPORT_DOWNLOAD_FAILED')
    }
    const contentLength = parseContentLength(response.headers.get('content-length'))
    if (contentLength != null) assertImportSizeAllowed(maxBytes, contentLength)
    return await readResponseBodyWithinLimit(response, maxBytes)
  } catch (error) {
    throw normalizeImportDownloadError(error)
  } finally {
    clearTimeout(timeout)
  }
}

async function completeImportedAsset(input: {
  assetId: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  label?: string | null
  buffer?: Buffer
}) {
  const probeUrl = toFetchableUrl(await getSignedObjectUrl(input.storageKey))
  const probed = await probeMediaMetadata(probeUrl, input.mimeType, { buffer: input.buffer })
  const metadata = normalizeEditorImportMetadata({
    label: input.label,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    ...probed,
  })
  const media = await ensureMediaObjectFromStorageKey(input.storageKey, metadata)

  return await completeEditorAsset({
    id: input.assetId,
    mediaObjectId: media.id,
    url: media.url,
    durationMs: metadata.durationMs,
    metadata,
  })
}

function requireImportKind(mimeType: string | null | undefined): EditorImportAssetKind {
  const kind = classifyEditorImportMimeType(mimeType)
  if (!kind) throw new EditorImportError('EDITOR_IMPORT_UNSUPPORTED_MIME')
  return kind
}

export async function assertSafeEditorImportUrl(value: string): Promise<string> {
  const url = parseHttpUrl(value)
  if (isBlockedHostname(url.hostname)) {
    throw new EditorImportError('EDITOR_IMPORT_URL_INVALID')
  }
  let resolved: Array<{ address: string }>
  try {
    resolved = await lookup(url.hostname, { all: true, verbatim: true })
  } catch {
    throw new EditorImportError('EDITOR_IMPORT_URL_INVALID')
  }
  if (resolved.length === 0 || resolved.some((address) => isBlockedIpAddress(address.address))) {
    throw new EditorImportError('EDITOR_IMPORT_URL_INVALID')
  }
  return url.toString()
}

function parseHttpUrl(value: string): URL {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url
  } catch {}
  throw new EditorImportError('EDITOR_IMPORT_URL_INVALID')
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized.endsWith('.localhost') || isBlockedIpAddress(normalized)
}

function isBlockedIpAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return isBlockedIpv4(address)
  if (family === 6) return isBlockedIpv6(address)
  return false
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return (
    a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
  )
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  const mappedIpv4 = ipv4FromMappedIpv6(normalized)
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4)
  const firstSegment = Number.parseInt(normalized.split(':', 1)[0] || '0', 16)
  return (
    normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || (firstSegment >= 0xfe80 && firstSegment <= 0xfebf)
  )
}

function ipv4FromMappedIpv6(address: string): string | null {
  const match = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!match) return null
  const high = Number.parseInt(match[1], 16)
  const low = Number.parseInt(match[2], 16)
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

function assertImportSizeAllowed(kindOrMaxBytes: EditorImportAssetKind | number, sizeBytes: number): void {
  const maxBytes = typeof kindOrMaxBytes === 'number' ? kindOrMaxBytes : MAX_IMPORT_BYTES_BY_KIND[kindOrMaxBytes]
  if (sizeBytes > maxBytes) {
    throw new EditorImportError('EDITOR_IMPORT_TOO_LARGE')
  }
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

async function readResponseBodyWithinLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    assertImportSizeAllowed(maxBytes, buffer.length)
    return buffer
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > maxBytes) {
      throw new EditorImportError('EDITOR_IMPORT_TOO_LARGE')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, total)
}

function normalizeImportDownloadError(error: unknown): Error {
  if (error instanceof EditorImportError) return error
  if (error instanceof Error && error.name === 'AbortError') {
    return new EditorImportError('EDITOR_IMPORT_TIMEOUT')
  }
  return new EditorImportError('EDITOR_IMPORT_DOWNLOAD_FAILED')
}

function generateImportStorageKey(editorProjectId: string, fileName: string | null | undefined, mimeType: string): string {
  const ext = extensionForImport(fileName, mimeType)
  return generateUniqueKey(`editor-import/${editorProjectId}`, ext)
}

function extensionForImport(fileName: string | null | undefined, mimeType: string): string {
  const ext = fileName ? path.extname(fileName).replace(/^\./, '').toLowerCase() : ''
  return ext || EXT_BY_MIME[mimeType] || 'bin'
}

function numericField<Key extends 'sizeBytes' | 'durationMs' | 'width' | 'height'>(
  key: Key,
  value: number | null | undefined,
): Partial<Record<Key, number>> {
  return typeof value === 'number' && Number.isFinite(value) ? { [key]: value } as Partial<Record<Key, number>> : {}
}
