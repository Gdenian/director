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

export class EditorImportError extends Error {
  constructor(public code: 'EDITOR_IMPORT_UNSUPPORTED_MIME' | 'EDITOR_IMPORT_URL_INVALID') {
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
  const sourceUrl = validateHttpUrl(input.url)
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
    const response = await fetch(toFetchableUrl(sourceUrl))
    if (!response.ok) {
      throw new Error(`EDITOR_IMPORT_DOWNLOAD_FAILED:${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const key = generateImportStorageKey(input.editorProjectId, null, mimeType)
    const uploadedKey = await uploadObject(buffer, key, 1, mimeType)
    return await completeImportedAsset({
      assetId: asset.id,
      storageKey: uploadedKey,
      mimeType,
      sizeBytes: buffer.length,
      label: input.label,
    })
  } catch (error) {
    await failEditorAsset({ id: asset.id, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

async function completeImportedAsset(input: {
  assetId: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  label?: string | null
}) {
  const probeUrl = toFetchableUrl(await getSignedObjectUrl(input.storageKey))
  const probed = await probeMediaMetadata(probeUrl, input.mimeType)
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

function validateHttpUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {}
  throw new EditorImportError('EDITOR_IMPORT_URL_INVALID')
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
