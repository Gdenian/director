import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceAssistantComposer } from '@/features/project-workspace/components/workspace-assistant/WorkspaceAssistantComposer'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('WorkspaceAssistantComposer', () => {
  it('renders a compact arrow-only send button without the assistant hint copy', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceAssistantComposer, {
        value: '继续生成剪辑表',
        error: null,
        pending: false,
        onChange: () => undefined,
        onSubmit: async () => undefined,
      }),
    )

    expect(html).toContain('aria-label="panel.send"')
    expect(html).toContain('lucide-arrow-right')
    expect(html).toContain('absolute bottom-1.5 right-1.5')
    expect(html).toContain('h-8 w-8')
    expect(html).not.toContain('>panel.send<')
    expect(html).not.toContain('panel.assistantHint')
    expect(html).not.toContain('通用助手会先读取项目状态')
  })
})
