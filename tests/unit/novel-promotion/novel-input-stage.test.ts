import * as React from 'react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import NovelInputStage from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/NovelInputStage'

interface MockStoryInputComposerProps {
  minRows: number
  maxHeightViewportRatio: number
  textareaClassName?: string
  topRight?: ReactNode
  footer?: ReactNode
  secondaryActions?: ReactNode
  primaryAction: ReactNode
}

let latestStoryInputProps: MockStoryInputComposerProps | null = null

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values && 'name' in values) {
      return `${key}:${String(values.name)}`
    }
    return key
  },
}))

vi.mock('@/components/story-input/StoryInputComposer', () => ({
  default: (props: MockStoryInputComposerProps) => {
    latestStoryInputProps = props
    return createElement(
      'section',
      {
        'data-min-rows': String(props.minRows),
        'data-max-height-ratio': String(props.maxHeightViewportRatio),
        'data-textarea-class': props.textareaClassName,
      },
      props.topRight,
      props.footer,
      props.secondaryActions,
      props.primaryAction,
      'StoryInputComposer',
    )
  },
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => createElement('span', null, 'TaskStatusInline'),
}))

vi.mock('@/components/home/AiWriteModal', () => ({
  default: () => createElement('div', null, 'AiWriteModal'),
}))

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
}))

vi.mock('@/lib/home/ai-story-expand', () => ({
  expandHomeStory: vi.fn(),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, ...props }: { name: string } & Record<string, unknown>) =>
    createElement('span', { ...props, 'data-icon': name }),
}))

beforeEach(() => {
  latestStoryInputProps = null
})

function findElementByType(node: ReactNode, type: string): React.ReactElement | null {
  const children = React.Children.toArray(node)
  for (const child of children) {
    if (!React.isValidElement(child)) continue
    if (child.type === type) return child
    const props = child.props as { children?: ReactNode }
    const nested = findElementByType(props.children, type)
    if (nested) return nested
  }
  return null
}

describe('NovelInputStage', () => {
  it('uses the shared composer with a taller adaptive baseline in story mode', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(NovelInputStage, {
        novelText: '',
        episodeName: '剧集 1',
        onNovelTextChange: () => undefined,
        onNext: () => undefined,
      }),
    )

    expect(html).toContain('StoryInputComposer')
    expect(html).toContain('data-min-rows="8"')
    expect(html).toContain('data-max-height-ratio="0.5"')
    expect(html).toContain('data-textarea-class="px-0 pt-0 pb-3 align-top"')
    expect(html).toContain('aiWrite.trigger')
    expect(html).toContain('AiWriteModal')
    expect(html).not.toContain('storyInput.wordCount 0')
    expect(html).not.toContain('storyInput.currentConfigSummary')
  })

  it('renders a local story file import action in the composer toolbar', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(NovelInputStage, {
        novelText: '',
        onNovelTextChange: () => undefined,
        onNext: () => undefined,
      }),
    )

    expect(html).toContain('type="file"')
    expect(html).toContain('accept=".txt,.md,.text,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"')
    expect(html).toContain('data-icon="upload"')

    const uploadInput = findElementByType(latestStoryInputProps?.secondaryActions, 'input')
    expect(uploadInput).toBeTruthy()

    const props = uploadInput && React.isValidElement(uploadInput)
      ? uploadInput.props as {
        onChange?: (event: { target: { files: File[]; value: string } }) => void
      }
      : {}

    expect(props.onChange).toEqual(expect.any(Function))
  })
})
