import { describe, expect, it } from 'vitest'
import {
  applyGeneratedStylePrompts,
  normalizeGeneratedStylePrompts,
} from '@/app/[locale]/workspace/asset-hub/components/style-prompt-generation'

describe('style asset modal prompt generation helpers', () => {
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
