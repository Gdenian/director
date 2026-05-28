import { describe, expect, it } from 'vitest'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'

describe('asset hub style prompt generation template', () => {
  it('zh template constrains reference images to reusable visual style only', () => {
    const template = getPromptTemplate(PROMPT_IDS.ASSET_HUB_STYLE_PROMPT_GENERATE, 'zh')

    expect(template).toContain('风格参考')
    expect(template).toContain('不是内容参考')
    expect(template).toContain('promptZh')
    expect(template).toContain('promptEn')
    expect(template).toContain('不要描述具体人物')
    expect(template).toContain('不要描述具体地点')
    expect(template).toContain('不要描述具体道具')
    expect(template).toContain('严格 JSON')
  })

  it('en template constrains reference images to reusable visual style only', () => {
    const template = getPromptTemplate(PROMPT_IDS.ASSET_HUB_STYLE_PROMPT_GENERATE, 'en')

    expect(template).toContain('style reference')
    expect(template).toContain('not a content reference')
    expect(template).toContain('promptZh')
    expect(template).toContain('promptEn')
    expect(template).toContain('Do not describe specific people')
    expect(template).toContain('Do not describe specific locations')
    expect(template).toContain('Do not describe specific props')
    expect(template).toContain('strict JSON')
  })
})
