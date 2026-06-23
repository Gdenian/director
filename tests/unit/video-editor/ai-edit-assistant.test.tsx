import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AiEditAssistant } from '@/features/video-editor/components/AiEditAssistant'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('AiEditAssistant', () => {
  it('renders instruction input, pending summary, and apply/discard actions', () => {
    const html = renderToStaticMarkup(
      <AiEditAssistant
        pendingVersion={{
          versionId: 'version-1',
          summary: '节奏更快，删掉空镜',
          reason: 'ai_refine',
          createdAt: '2026-06-22T00:00:00.000Z',
        }}
        error="Import failed"
        onSubmitInstruction={() => undefined}
        onApplyPending={() => undefined}
        onDiscardPending={() => undefined}
      />,
    )

    expect(html).toContain('editor.aiAssistant.instructionPlaceholder')
    expect(html).toContain('节奏更快，删掉空镜')
    expect(html).toContain('Import failed')
    expect(html).toContain('editor.aiAssistant.applyPending')
    expect(html).toContain('editor.aiAssistant.discardPending')
  })
})
