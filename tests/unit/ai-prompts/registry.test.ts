import { describe, expect, it } from 'vitest'
import { buildAiPrompt, getAiPromptTemplate, resolveAiPromptIdFromOperationId } from '@/lib/ai-prompts'
import { AI_PROMPT_CATALOG } from '@/lib/ai-prompts/registry'
import { AI_PROMPT_IDS, type AiPromptId } from '@/lib/ai-prompts/ids'
import { buildDirectorStyleDoc } from '@/lib/director-style'

describe('ai prompt registry', () => {
  it('maps workflow skill ids to the same unified template id', () => {
    expect(resolveAiPromptIdFromOperationId('analyze_characters')).toBe(AI_PROMPT_IDS.CHARACTER_ANALYZE)
    expect(resolveAiPromptIdFromOperationId('create_shot_plan')).toBe(AI_PROMPT_IDS.STORYBOARD_PLAN)
  })

  it('loads unified template content from the new functional directory', () => {
    const template = getAiPromptTemplate(AI_PROMPT_IDS.PROP_ANALYZE, 'zh')

    expect(template).toContain('关键剧情道具资产分析师')
    expect(template).toContain('宁缺毋滥')
  })

  it('renders placeholders through the unified prompt builder', () => {
    const prompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.CHARACTER_CREATE,
      locale: 'zh',
      variables: {
        user_input: '创建一个阴郁的老管家',
      },
    })

    expect(prompt).toContain('创建一个阴郁的老管家')
  })

  it('injects director style requirements for prompts that opt into style fields', () => {
    const prompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.CHARACTER_ANALYZE,
      locale: 'zh',
      variables: {
        input: '她推门进屋。',
        characters_lib_info: '暂无已有角色',
      },
      directorStyleDoc: buildDirectorStyleDoc('horror-suspense'),
    })

    expect(prompt).toContain('【导演风格要求】')
    expect(prompt).toContain('"character"')
    expect(prompt).toContain('"temperament"')
  })

  it('keeps style requirements wired in every opted-in prompt template locale', () => {
    const stylePromptIds = Object.entries(AI_PROMPT_CATALOG)
      .filter((entry) => entry[1].variableKeys.includes('style_requirements'))
      .map((entry) => entry[0])

    expect(stylePromptIds.length).toBeGreaterThan(0)

    for (const promptId of stylePromptIds) {
      expect(getAiPromptTemplate(promptId as AiPromptId, 'zh')).toContain('{style_requirements}')
      expect(getAiPromptTemplate(promptId as AiPromptId, 'en')).toContain('{style_requirements}')
    }
  })

  it('registers style preset design prompts in both locales', () => {
    const visualZh = getAiPromptTemplate(AI_PROMPT_IDS.DESIGN_VISUAL_STYLE_PRESET, 'zh')
    const visualEn = getAiPromptTemplate(AI_PROMPT_IDS.DESIGN_VISUAL_STYLE_PRESET, 'en')
    const directorZh = getAiPromptTemplate(AI_PROMPT_IDS.DESIGN_DIRECTOR_STYLE_PRESET, 'zh')
    const directorEn = getAiPromptTemplate(AI_PROMPT_IDS.DESIGN_DIRECTOR_STYLE_PRESET, 'en')

    expect(visualZh).toContain('"detailLevel"')
    expect(visualEn).toContain('"negativePrompt"')
    expect(directorZh).toContain('"storyboardPlan"')
    expect(directorEn).toContain('"cameraMotion"')
  })

  it('registers Lyria prompt expansion templates in both locales', () => {
    const zh = buildAiPrompt({
      promptId: AI_PROMPT_IDS.MUSIC_LYRIA_PROMPT_EXPAND,
      locale: 'zh',
      variables: {
        user_input: '给追车戏做一段紧张配乐',
        duration_seconds: '30',
        vocal_mode: 'instrumental',
        genre: 'cinematic',
        mood: 'tense',
      },
    })
    const en = buildAiPrompt({
      promptId: AI_PROMPT_IDS.MUSIC_LYRIA_PROMPT_EXPAND,
      locale: 'en',
      variables: {
        user_input: 'tense chase cue',
        duration_seconds: '30',
        vocal_mode: 'instrumental',
        genre: 'cinematic',
        mood: 'tense',
      },
    })

    expect(zh).toContain('给追车戏做一段紧张配乐')
    expect(zh).toContain('instrumental')
    expect(en).toContain('tense chase cue')
    expect(en).toContain('instrumental')
  })

  it('renders video style requirements into storyboard detail prompts', () => {
    const prompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL,
      locale: 'en',
      variables: {
        panels_json: '[]',
        characters_age_gender: 'none',
        locations_description: 'none',
        props_description: 'none',
      },
      directorStyleDoc: buildDirectorStyleDoc('horror-suspense'),
    })

    expect(prompt).toContain('Director style requirements:')
    expect(prompt).toContain('"storyboardDetail"')
    expect(prompt).toContain('"video"')
    expect(prompt).toContain('"cameraMotion"')
  })

  it('keeps Chinese canvas-visible prompt templates from requiring English prompt output', () => {
    const variantTemplate = getAiPromptTemplate(AI_PROMPT_IDS.SHOT_VARIANT_ANALYZE, 'zh')
    const videoTemplate = getAiPromptTemplate(AI_PROMPT_IDS.EDIT_SCRIPT_VIDEO_PROMPT, 'zh')
    const videoBlockTemplate = getAiPromptTemplate(AI_PROMPT_IDS.EDIT_SCRIPT_VIDEO_PROMPT_BLOCK, 'zh')
    const storyboardDetailTemplate = getAiPromptTemplate(AI_PROMPT_IDS.STORYBOARD_REFINE_DETAIL, 'zh')
    const visualStyleTemplate = getAiPromptTemplate(AI_PROMPT_IDS.DESIGN_VISUAL_STYLE_PRESET, 'zh')
    const directorStyleTemplate = getAiPromptTemplate(AI_PROMPT_IDS.DESIGN_DIRECTOR_STYLE_PRESET, 'zh')

    expect(variantTemplate).toContain('所有会写入画布或给用户展示的提示词字段必须全中文')
    expect(variantTemplate).toContain('❌ video_prompt 使用英文句子（必须中文）')
    expect(variantTemplate).not.toContain('必须英文')
    expect(variantTemplate).not.toContain('POV shot of a smartphone screen')

    expect(videoTemplate).toContain('字段值必须整体使用中文自然语言')
    expect(videoTemplate).toContain('温暖写实的室内情感戏')
    expect(videoTemplate).not.toContain('Warm realistic indoor drama')
    expect(videoTemplate).not.toContain('Sound effects only')

    expect(videoBlockTemplate).toContain('字段值必须整体使用中文自然语言')
    expect(videoBlockTemplate).toContain('安静的路边公交站单镜头')
    expect(videoBlockTemplate).not.toContain('Quiet roadside bus-stop shot')
    expect(videoBlockTemplate).not.toContain('Sound effects only')

    expect(storyboardDetailTemplate).toContain('video_prompt 会显示在画布上')
    expect(visualStyleTemplate).toContain('prompt 与 negativePrompt 会拼入图片生成提示词')
    expect(directorStyleTemplate).toContain('所有 imagePrompt、prompt、negativePrompt、avoid 字段')
  })
})
