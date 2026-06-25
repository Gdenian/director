import { describe, expect, it } from 'vitest'
import { TASK_TYPE } from '@/lib/task/types'
import { extractTaskModelKeys, getTaskOperationCapability } from '@/lib/admin/task-capabilities'

describe('task operation capabilities', () => {
  it('maps task types to operation capabilities', () => {
    expect(getTaskOperationCapability(TASK_TYPE.ANALYZE_NOVEL)).toBe('text')
    expect(getTaskOperationCapability(TASK_TYPE.IMAGE_PANEL)).toBe('image')
    expect(getTaskOperationCapability(TASK_TYPE.VIDEO_PANEL)).toBe('video')
    expect(getTaskOperationCapability(TASK_TYPE.VOICE_LINE)).toBe('voice')
    expect(getTaskOperationCapability(TASK_TYPE.LIP_SYNC)).toBe('lip_sync')
  })

  it('extracts possible model keys from task payload without exposing prompt text', () => {
    expect(extractTaskModelKeys({
      model: 'openai::gpt-4o',
      imageModel: 'fal::flux',
      prompt: 'secret prompt',
      meta: { audioModel: 'fal::tts' },
    })).toEqual(['openai::gpt-4o', 'fal::flux', 'fal::tts'])
  })

  it('extracts first-last-frame video model keys', () => {
    expect(extractTaskModelKeys({
      videoModel: 'video-basic',
      firstLastFrame: {
        flModel: 'video-premium',
      },
    })).toEqual(['video-basic', 'video-premium'])
  })
})
