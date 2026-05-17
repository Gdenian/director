import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkspaceAssistantReasoningPart } from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantRenderers'

describe('WorkspaceAssistantReasoningPart', () => {
  it('renders available reasoning text as muted text', () => {
    const html = renderToStaticMarkup(
      <WorkspaceAssistantReasoningPart
        type="reasoning"
        text="Checking project state before writing."
        status={{ type: 'complete' }}
      />,
    )

    expect(html).toContain('Checking project state before writing.')
    expect(html).toContain('text-[var(--glass-text-tertiary)]')
  })

  it('hides empty reasoning text', () => {
    const html = renderToStaticMarkup(
      <WorkspaceAssistantReasoningPart
        type="reasoning"
        text=" "
        status={{ type: 'complete' }}
      />,
    )

    expect(html).toBe('')
  })
})
