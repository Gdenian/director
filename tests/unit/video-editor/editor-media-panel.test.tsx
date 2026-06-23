import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EditorMediaPanel } from '@/features/video-editor/components/EditorMediaPanel'
import type { AiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/tool-types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const media: AiEditableMediaLibrary = {
  fps: 30,
  entries: [
    {
      id: 'generated:panel-1',
      sourceType: 'generated_panel_video',
      kind: 'video',
      status: 'completed',
      eligibleForTimeline: true,
      url: '/generated.mp4',
      label: 'Generated shot',
    },
    {
      id: 'imported:asset-1',
      sourceType: 'user_import_video',
      kind: 'video',
      status: 'pending',
      eligibleForTimeline: false,
      url: null,
      label: 'Imported clip',
    },
  ],
}

describe('EditorMediaPanel', () => {
  it('renders generated/imported labels and pending status', () => {
    const html = renderToStaticMarkup(
      <EditorMediaPanel
        media={media}
        onImportFile={() => undefined}
        onImportUrl={() => undefined}
        onRefresh={() => undefined}
      />,
    )

    expect(html).toContain('Generated shot')
    expect(html).toContain('editor.media.source.generated')
    expect(html).toContain('Imported clip')
    expect(html).toContain('editor.media.source.imported')
    expect(html).toContain('editor.media.status.pending')
  })
})
