import { describe, expect, it } from 'vitest'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'

describe('edit script block-first prompt flow', () => {
  it('builds block-first audio and primary prompts without a per-shot video prompt input', () => {
    const screenplayText = [
      '标题：《灯下的人》',
      '',
      '故事梗概：人物进入房间，顺着光线发现桌上的旧物。',
      '',
      '内景 房间 - 夜晚',
      '',
      '动作：人物走入昏暗房间，沿着窗边的光线慢慢前行，在桌前停下。',
    ].join('\n')
    const cameraJson = JSON.stringify({
      videoBlocks: [
        {
          blockNumber: 1,
          type: 'group',
          shotNumbers: [1, 2],
          shots: [
            { shotNumber: 1, camera: 'wide shot, slow push in' },
            { shotNumber: 2, camera: 'medium shot, same-direction track' },
          ],
        },
      ],
    })

    const audioPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_AUDIO,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        screenplay_text: screenplayText,
        camera_json: cameraJson,
      },
    })

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

    expect(screenplayPrompt).toContain('传统短片剧本')
    expect(screenplayPrompt).toContain('这里只写剧情内容')
    expect(screenplayPrompt).toContain('不输出 JSON')

    expect(audioPrompt).toContain('block-first 镜头方式 JSON')
    expect(audioPrompt).toContain(cameraJson)
    expect(audioPrompt).toContain(screenplayText)
    expect(audioPrompt).toContain('编剧剧本')
    expect(audioPrompt).toContain('sound effects only')
    expect(audioPrompt).toContain('不要写 BGM、背景音乐、持续配乐')
    expect(audioPrompt).toContain('不要写 BGM 或持续配乐')
    expect(audioPrompt).toContain('有叙事目的的电影化短音效')
    expect(audioPrompt).toContain('非同期但叙事绑定的主观声音设计')
    expect(audioPrompt).toContain('耳鸣、心跳放大、低频压迫')
    expect(audioPrompt).toContain('角色主观体验或剪辑点')
    expect(audioPrompt).toContain('不能发展成连续音乐')
    expect(audioPrompt).not.toContain('video_prompt_json')

    const primaryPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        screenplay_text: screenplayText,
        duration_seconds: '8',
        aspect_ratio: '9:16',
        style_context: 'cinematic',
        timeline_json: JSON.stringify({
          videoBlocks: [
            {
              blockNumber: 1,
              type: 'group',
              shotNumbers: [1, 2],
              gridMode: '2x2',
              durationSec: 8,
              shots: [
                { shotNumber: 1, durationSec: 4, beat: '建立空间' },
                { shotNumber: 2, durationSec: 4, beat: '动作延续' },
              ],
            },
          ],
        }),
        visual_action_json: JSON.stringify({
          videoBlocks: [
            {
              blockNumber: 1,
              type: 'group',
              shotNumbers: [1, 2],
              shots: [
                { shotNumber: 1, visualAction: '人物走入光线', charactersAndScene: '人物 / 房间' },
                { shotNumber: 2, visualAction: '人物顺着光线继续前行', charactersAndScene: '人物 / 房间' },
              ],
            },
          ],
        }),
        camera_json: cameraJson,
        audio_json: JSON.stringify({
          videoBlocks: [
            {
              blockNumber: 1,
              type: 'group',
              shotNumbers: [1, 2],
              shots: [
                { shotNumber: 1, sound: '低频环境声' },
                { shotNumber: 2, sound: '环境声延续' },
              ],
            },
          ],
        }),
      },
    })

    expect(primaryPrompt).toContain('videoBlocks 是视频生成主结构')
    expect(primaryPrompt).toContain('必须以编剧剧本作为唯一剧情事实')
    expect(primaryPrompt).toContain(screenplayText)
    expect(primaryPrompt).toContain('videoBlocks[].prompt 是后续直接发给视频模型的最终提示词')
    expect(primaryPrompt).toContain('不得机械拼接 shots[].videoPrompt')
    expect(primaryPrompt).toContain('每个 videoBlocks[].prompt 必须包含视频模型声音约束')
    expect(primaryPrompt).toContain('sound effects only')
    expect(primaryPrompt).toContain('不要生成 BGM、背景音乐、持续配乐')
    expect(primaryPrompt).toContain('有叙事目的的电影化短音效')
    expect(primaryPrompt).toContain('非同期但叙事绑定的主观声音设计')
    expect(primaryPrompt).toContain('惊吓 stinger 或 sub hit')
    expect(primaryPrompt).toContain('不能发展成连续音乐')
    expect(primaryPrompt).toContain('single prompt 的声音必须克制')
    expect(primaryPrompt).not.toContain('video_prompt_json')
  })
})
