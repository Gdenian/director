import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EditFirstComposer } from '@/features/project-workspace/components/workspace-assistant/EditFirstComposer'
import { EditFirstInlineReply } from '@/features/project-workspace/components/workspace-assistant/EditFirstInlineReply'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) return key
    return `${key}:${JSON.stringify(values)}`
  },
}))

describe('edit-first assistant inline reply', () => {
  it('renders clickable brief questions in the message stream without a count prefix', () => {
    const html = renderToStaticMarkup(
      <EditFirstInlineReply
        pending={false}
        progressKind={null}
        activeQuestion={{
          id: 'tone',
          label: '想要什么样的情绪？',
          options: [
            { id: 'A', label: '冷静' },
            { id: 'B', label: '紧张' },
            { id: 'C', label: '开放留白' },
          ],
        }}
        onSelectOption={() => undefined}
      />,
    )

    expect(html).toContain('panel.editFirstStatusAnswering')
    expect(html).toContain('想要什么样的情绪？')
    expect(html).toContain('A: 冷静')
    expect(html).toContain('B: 紧张')
    expect(html).toContain('C: 开放留白')
    expect(html).not.toContain('1/3')
    expect(html).not.toContain('3/3')
  })

  it('renders detailed edit table progress as an assistant reply block', () => {
    const html = renderToStaticMarkup(
      <EditFirstInlineReply
        pending
        progressKind="editScript"
        activeQuestion={null}
        onSelectOption={() => undefined}
      />,
    )

    expect(html).toContain('panel.editFirstStatusEditScript')
    expect(html).toContain('panel.editFirstProgress.editScript.rhythm')
    expect(html).toContain('panel.editFirstProgress.editScript.videoPrompt')
    expect(html).toContain('panel.editFirstProgress.editScript.assets')
    expect(html).toContain('panel.editFirstProgress.currentStep')
  })
})

describe('edit-first composer', () => {
  it('keeps generation status and questions out of the input area', () => {
    const html = renderToStaticMarkup(
      <EditFirstComposer
        episodeId="episode-1"
        value=""
        error={null}
        pending
        onChange={() => undefined}
        onSubmit={async () => undefined}
      />,
    )

    expect(html).toContain('panel.composerPlaceholder')
    expect(html).toContain('panel.send')
    expect(html).not.toContain('panel.editFirstGenerating')
    expect(html).not.toContain('panel.editFirstStatusBriefQuestions')
    expect(html).not.toContain('panel.editFirstStatusEditScript')
    expect(html).not.toContain('panel.briefQuestionBadge')
  })
})
