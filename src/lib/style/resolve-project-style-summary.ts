import { prisma } from '@/lib/prisma'
import type { MediaRef, ProjectResolvedStyleSummary } from '@/types/project'
import { resolveStyleContext } from './resolve-style-context'

type ResolveProjectStyleSummaryInput = {
  userId: string
  projectId: string
}

type PreviewMediaRecord = {
  id: string
  publicId: string
  mimeType: string | null
  sizeBytes: bigint | number | null
  width: number | null
  height: number | null
  durationMs: number | null
}

function mapPreviewMedia(media: PreviewMediaRecord | null | undefined): MediaRef | null {
  if (!media) return null
  return {
    id: media.id,
    publicId: media.publicId,
    url: `/m/${encodeURIComponent(media.publicId)}`,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes == null ? null : Number(media.sizeBytes),
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
  }
}

export async function resolveProjectStyleSummary(
  input: ResolveProjectStyleSummaryInput,
): Promise<ProjectResolvedStyleSummary> {
  const resolvedStyle = await resolveStyleContext({
    userId: input.userId,
    projectId: input.projectId,
  })

  if (resolvedStyle.source !== 'style-asset' || !resolvedStyle.styleAssetId) {
    return {
      styleAssetId: resolvedStyle.styleAssetId,
      label: resolvedStyle.label,
      source: resolvedStyle.source,
      assetSource: null,
      previewMedia: null,
    }
  }

  const styleAsset = await prisma.globalStyle.findFirst({
    where: {
      id: resolvedStyle.styleAssetId,
      OR: [
        { source: 'system' },
        { userId: input.userId },
      ],
    },
    select: {
      source: true,
      previewMedia: {
        select: {
          id: true,
          publicId: true,
          mimeType: true,
          sizeBytes: true,
          width: true,
          height: true,
          durationMs: true,
        },
      },
    },
  })

  return {
    styleAssetId: resolvedStyle.styleAssetId,
    label: resolvedStyle.label,
    source: resolvedStyle.source,
    assetSource: styleAsset?.source === 'system' ? 'system' : styleAsset?.source ? 'user' : null,
    previewMedia: mapPreviewMedia(styleAsset?.previewMedia),
  }
}
