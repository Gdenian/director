import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import {
  applyGeneratedStylePrompts,
  normalizeGeneratedStylePrompts,
  resolveStylePromptGenerationError,
} from '@/app/[locale]/workspace/asset-hub/components/style-prompt-generation'

const hookMocks = vi.hoisted(() => ({
  useStyleActions: vi.fn(() => ({
    create: { mutateAsync: vi.fn() },
    update: { mutateAsync: vi.fn() },
  })),
  useUploadAssetHubTempMedia: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useAiDesignStyle: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}))

vi.mock('@/lib/query/hooks', () => hookMocks)
vi.mock('next/image', async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { alt?: string; src?: string; className?: string }) =>
      ReactModule.createElement('img', {
        alt: props.alt || '',
        src: props.src || '',
        className: props.className || '',
      }),
  }
})

import StyleAssetModal from '@/app/[locale]/workspace/asset-hub/components/StyleAssetModal'

const messages = {
  assetHub: {
    cancel: '取消',
    save: '保存',
    style: {
      createTitle: '新建风格',
      editTitle: '编辑风格',
      name: '风格名称',
      namePlaceholder: '例如：电影写实',
      promptZh: '中文提示词',
      promptZhPlaceholder: '写出生成时要注入的中文风格提示词',
      promptEn: '英文提示词',
      promptEnPlaceholder: '可选，用于英文模型的风格提示词',
      referenceImage: '参考图',
      previewImage: '预览图',
      imageUrlPlaceholder: '粘贴图片 URL，或上传图片',
      upload: '上传',
      uploading: '上传中...',
      saving: '保存中...',
      generatePrompt: '生成提示词',
      generatingPrompt: '生成中...',
      generatePromptFailed: '生成风格提示词失败',
      missingReferenceImage: '请先上传或填写参考图',
      overwritePromptConfirm: '当前提示词已有内容，是否用参考图生成结果覆盖？',
    },
  },
} as const

function renderWithIntl(node: ReactElement) {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: messages as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps))
}

describe('style asset modal prompt generation helpers', () => {
  const errorMessages = {
    fallback: '生成风格提示词失败',
    missingConfig: '生成提示词失败：未配置分析模型，请先到设置页配置可用模型后重试。',
    invalidOutput: '模型没有返回完整的中英文风格提示词，请换一张参考图后重试。',
  }

  it('normalizes generated prompt payloads', () => {
    expect(normalizeGeneratedStylePrompts({
      promptZh: '  中文风格  ',
      promptEn: '  english style  ',
    })).toEqual({
      promptZh: '中文风格',
      promptEn: 'english style',
    })
  })

  it('rejects generated prompt payloads with missing fields', () => {
    expect(() => normalizeGeneratedStylePrompts({
      promptZh: '中文风格',
    })).toThrow('Generated style prompts must include promptZh and promptEn')
  })

  it('maps missing model configuration errors to a localized prompt generation message', () => {
    const error = Object.assign(new Error('Missing required configuration'), {
      payload: {
        error: {
          code: 'MISSING_CONFIG',
          message: 'Missing required configuration',
        },
        code: 'MISSING_CONFIG',
      },
    })

    expect(resolveStylePromptGenerationError(error, errorMessages)).toBe(errorMessages.missingConfig)
  })

  it('maps incomplete model extraction output to a localized prompt generation message', () => {
    expect(resolveStylePromptGenerationError(
      new Error('Style prompt JSON must include promptZh and promptEn'),
      errorMessages,
    )).toBe(errorMessages.invalidOutput)
  })

  it('fills empty fields without confirmation', () => {
    expect(applyGeneratedStylePrompts({
      current: { promptZh: '', promptEn: '' },
      generated: { promptZh: '中文风格', promptEn: 'english style' },
      confirmOverwrite: () => false,
    })).toEqual({
      promptZh: '中文风格',
      promptEn: 'english style',
      applied: true,
    })
  })

  it('keeps existing fields when overwrite confirmation is declined', () => {
    expect(applyGeneratedStylePrompts({
      current: { promptZh: '旧中文', promptEn: 'old english' },
      generated: { promptZh: '新中文', promptEn: 'new english' },
      confirmOverwrite: () => false,
    })).toEqual({
      promptZh: '旧中文',
      promptEn: 'old english',
      applied: false,
    })
  })

  it('overwrites existing fields when overwrite confirmation is accepted', () => {
    expect(applyGeneratedStylePrompts({
      current: { promptZh: '旧中文', promptEn: 'old english' },
      generated: { promptZh: '新中文', promptEn: 'new english' },
      confirmOverwrite: () => true,
    })).toEqual({
      promptZh: '新中文',
      promptEn: 'new english',
      applied: true,
    })
  })
})

describe('StyleAssetModal prompt generation render', () => {
  it('renders generate prompt button in the reference image section', () => {
    Reflect.set(globalThis, 'React', React)
    const html = renderWithIntl(
      createElement(StyleAssetModal, {
        folderId: null,
        style: null,
        onClose: () => undefined,
        onSuccess: () => undefined,
      }),
    )

    expect(html).toContain('生成提示词')
    expect(html).toContain('请先上传或填写参考图')
  })

  it('shows generating label when style prompt generation is pending', () => {
    Reflect.set(globalThis, 'React', React)
    hookMocks.useAiDesignStyle.mockReturnValueOnce({
      mutateAsync: vi.fn(),
      isPending: true,
    })

    const html = renderWithIntl(
      createElement(StyleAssetModal, {
        folderId: null,
        style: {
          id: 'style-1',
          scope: 'global',
          kind: 'style',
          family: 'visual',
          name: '电影写实',
          folderId: null,
          capabilities: {
            canGenerate: false,
            canSelectRender: false,
            canRevertRender: false,
            canModifyRender: false,
            canUploadRender: false,
            canBindVoice: false,
            canCopyFromGlobal: false,
          },
          taskRefs: [],
          taskState: {
            isRunning: false,
            lastError: null,
          },
          promptZh: '',
          promptEn: '',
          referenceImageUrl: 'https://example.com/ref.jpg',
          referenceMedia: null,
          previewImageUrl: null,
          previewMedia: null,
          isDefault: false,
          isSystemSeed: false,
          createdAt: '2026-05-28T00:00:00.000Z',
          updatedAt: '2026-05-28T00:00:00.000Z',
        },
        onClose: () => undefined,
        onSuccess: () => undefined,
      }),
    )

    expect(html).toContain('生成中...')
  })
})
