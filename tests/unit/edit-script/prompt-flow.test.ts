import { describe, expect, it } from 'vitest'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'

describe('edit script block-first prompt flow', () => {
  it('builds a unified primary prompt without intermediate specialist inputs', () => {
    const screenplayText = [
      '标题：《灯下的人》',
      '',
      '故事梗概：人物进入房间，顺着光线发现桌上的旧物。',
      '',
      '内景 房间 - 夜晚',
      '',
      '动作：人物走入昏暗房间，沿着窗边的光线慢慢前行，在桌前停下。',
    ].join('\n')

    const screenplayPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        duration_seconds: '8',
        aspect_ratio: '9:16',
        style_context: 'cinematic',
      },
    })

    expect(screenplayPrompt).toContain('AI 可控短片剧本')
    expect(screenplayPrompt).toContain('这里只写剧情内容')
    expect(screenplayPrompt).toContain('不输出 JSON')
    expect(screenplayPrompt).toContain('角色表')
    expect(screenplayPrompt).toContain('场景 1｜内景/外景. 地点 - 时间')
    expect(screenplayPrompt).toContain('角色名（可选表演提示）')
    expect(screenplayPrompt).toContain('旁白（V.O.）')
    expect(screenplayPrompt).toContain('角色名（O.S.）')
    expect(screenplayPrompt).toContain('场景 N｜内景/外景. 地点 - 时间')
    expect(screenplayPrompt).toContain('不要把它写成字幕或屏幕文字')
    expect(screenplayPrompt).toContain('不要出现“镜头”“特写”“推镜”“剪切”“CUT TO”')

    const primaryPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        screenplay_text: screenplayText,
        duration_seconds: '8',
        aspect_ratio: '9:16',
        style_context: 'cinematic',
      },
    })

    expect(primaryPrompt).toContain('统一剪辑核心表 Agent')
    expect(primaryPrompt).toContain('从编剧剧本直接生成唯一核心剪辑表')
    expect(primaryPrompt).toContain('videoBlocks 是视频生成主结构')
    expect(primaryPrompt).toContain('编剧剧本是唯一剧情事实')
    expect(primaryPrompt).toContain(screenplayText)
    expect(primaryPrompt).toContain('videoBlocks[].prompt 是后续直接发给视频模型的最终提示词')
    expect(primaryPrompt).toContain('group prompt 不是把 single prompt 机械合并')
    expect(primaryPrompt).toContain('纯文字生视频')
    expect(primaryPrompt).toContain('15 秒是最高优先级硬上限')
    expect(primaryPrompt).toContain('如果加入下一个 shot 会让当前 group 超过 15 秒')
    expect(primaryPrompt).toContain('不能输出一个 20 秒 group')
    expect(primaryPrompt).toContain('不能输出一个 25 秒 group')
    expect(primaryPrompt).toContain('默认优先使用 group 只在不超过 15 秒时成立')
    expect(primaryPrompt).toContain('[00:00-00:03] 镜头1')
    expect(primaryPrompt).toContain('每个 prompt 必须包含声音约束')
    expect(primaryPrompt).toContain('sound effects only')
    expect(primaryPrompt).toContain('不要生成 BGM、背景音乐、持续配乐')
    expect(primaryPrompt).toContain('有叙事目的的电影化短音效')
    expect(primaryPrompt).toContain('剧本已有对白、旁白或画外音')
    expect(primaryPrompt).toContain('角色说{台词原文}')
    expect(primaryPrompt).toContain('生成配音不等于生成字幕')
    expect(primaryPrompt).toContain('音效使用 <音效描述>')
    expect(primaryPrompt).toContain('台词必须来自剧本或用户需求')
    expect(primaryPrompt).toContain('非同期但叙事绑定的主观声音设计')
    expect(primaryPrompt).toContain('惊吓 stinger 或 sub hit')
    expect(primaryPrompt).toContain('不能发展成连续音乐')
    expect(primaryPrompt).toContain('声音可以轻微先于画面出现形成 pre-lap')
    expect(primaryPrompt).toContain('切镜后保留短暂尾音')
    expect(primaryPrompt).toContain('single prompt 的声音必须克制')
    expect(primaryPrompt).toContain('slowly lifts')
    expect(primaryPrompt).not.toContain('slowly li  fts')
    expect(primaryPrompt).not.toContain('timeline_json')
    expect(primaryPrompt).not.toContain('visual_action_json')
    expect(primaryPrompt).not.toContain('camera_json')
    expect(primaryPrompt).not.toContain('audio_json')
    expect(primaryPrompt).not.toContain('2x2')
    expect(primaryPrompt).not.toContain('3x3')
    expect(primaryPrompt).not.toContain('宫格')

    const englishPrimaryPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      locale: 'en',
      variables: {
        user_request: 'Create a continuous short film',
        screenplay_text: screenplayText,
        duration_seconds: '8',
        aspect_ratio: '9:16',
        style_context: 'cinematic',
      },
    })

    expect(englishPrimaryPrompt).toContain('15-second limit is the highest-priority hard ceiling')
    expect(englishPrimaryPrompt).toContain('If adding the next shot would make the current group exceed 15 seconds')
    expect(englishPrimaryPrompt).toContain('must not become one 20-second group')
    expect(englishPrimaryPrompt).toContain('must not become one 25-second group')
    expect(englishPrimaryPrompt).toContain('Prefer group by default only when the group stays within 15 seconds')
  })
})
