import * as React from 'react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import HomePage from '@/app/[locale]/home/page'
import {
  HOME_QUICK_START_MIN_ROWS,
  resolveTextareaTargetHeight,
} from '@/lib/ui/textarea-height'

interface MockStoryInputComposerProps {
  value?: string
  onValueChange?: (value: string) => void
  minRows: number
  textareaClassName?: string
  primaryAction: ReactNode
  secondaryActions?: ReactNode
}

let latestStoryInputProps: MockStoryInputComposerProps | null = null

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { name: 'Earth' } },
    status: 'authenticated',
  }),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}))

vi.mock('@/components/Navbar', () => ({
  default: () => createElement('nav', null, 'Navbar'),
}))

vi.mock('@/components/story-input/StoryInputComposer', () => ({
  default: (props: MockStoryInputComposerProps) => {
    latestStoryInputProps = props
    return createElement(
      'section',
      {
        'data-min-rows': String(props.minRows),
        'data-textarea-class': props.textareaClassName,
        'data-value': props.value,
      },
      props.secondaryActions,
      props.primaryAction,
      'StoryInputComposer',
    )
  },
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, ...props }: { name: string } & Record<string, unknown>) =>
    createElement('span', { ...props, 'data-icon': name }),
  IconGradientDefs: (props: Record<string, unknown>) => createElement('span', props),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname: string }
    children: React.ReactNode
  } & Record<string, unknown>) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname
    return createElement('a', { href: resolvedHref, ...props }, children)
  },
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
}))

vi.mock('@/lib/home/create-project-launch', () => ({
  createHomeProjectLaunch: vi.fn(),
}))

vi.mock('@/lib/home/ai-story-expand', () => ({
  expandHomeStory: vi.fn(),
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

describe('resolveTextareaTargetHeight', () => {
  it('keeps the home quick-start input at least three rows tall', () => {
    expect(resolveTextareaTargetHeight({
      minHeight: 96,
      maxHeight: 320,
      scrollHeight: 54,
    })).toBe(96)
  })

  it('caps the auto-resized height to the viewport ceiling', () => {
    expect(resolveTextareaTargetHeight({
      minHeight: 96,
      maxHeight: 180,
      scrollHeight: 240,
    })).toBe(180)
  })
})

describe('HomePage quick-start input', () => {
  it('renders the homepage textarea with a default three-row height baseline', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(createElement(HomePage))

    expect(HOME_QUICK_START_MIN_ROWS).toBe(3)
    expect(html).toContain('StoryInputComposer')
    expect(html).toContain('data-min-rows="3"')
    expect(html).toContain('data-textarea-class="px-0 pt-0 pb-3 align-top"')
  })

  it('renders a local text file upload action beside quick-start creation', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(createElement(HomePage))

    expect(html).toContain('type="file"')
    expect(html).toContain('accept=".txt,.md,.text,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"')
    expect(html).toContain('data-icon="upload"')
  })

  it('wires the local file input to a change handler', () => {
    Reflect.set(globalThis, 'React', React)

    renderToStaticMarkup(createElement(HomePage))

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
