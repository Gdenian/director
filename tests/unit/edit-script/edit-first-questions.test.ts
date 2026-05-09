import { describe, expect, it } from 'vitest'

import {
  buildEditFirstPromptWithAnswers,
} from '@/features/project-workspace/components/workspace-assistant/edit-first-questions'

describe('edit first questions', () => {
  it('adds selected brief answers to the generation prompt', () => {
    const prompt = buildEditFirstPromptWithAnswers({
      originalPrompt: '  给我一个一分钟科幻短片  ',
      answerSectionTitle: '用户已点击选择的基础需求：',
      answers: ['  画幅: 横屏 16:9 ', '', '主角: 冷静研究员'],
    })

    expect(prompt).toBe([
      '给我一个一分钟科幻短片',
      '',
      '用户已点击选择的基础需求：',
      '- 画幅: 横屏 16:9',
      '- 主角: 冷静研究员',
    ].join('\n'))
  })

  it('keeps the original prompt when no brief answers exist', () => {
    expect(buildEditFirstPromptWithAnswers({
      originalPrompt: '  给我一个一分钟科幻短片  ',
      answerSectionTitle: '用户已点击选择的基础需求：',
      answers: ['  ', ''],
    })).toBe('给我一个一分钟科幻短片')
  })
})
