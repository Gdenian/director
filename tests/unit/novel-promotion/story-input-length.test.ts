import { describe, expect, it } from 'vitest'
import {
  DIRECT_STORY_TO_SCRIPT_MAX_CHARS,
  canRunDirectStoryToScript,
} from '@/lib/novel-promotion/story-input-length'

describe('story input length policy', () => {
  it('allows direct story-to-script below the direct generation limit', () => {
    expect(canRunDirectStoryToScript('a'.repeat(DIRECT_STORY_TO_SCRIPT_MAX_CHARS))).toBe(true)
  })

  it('requires smart split above the direct generation limit', () => {
    expect(canRunDirectStoryToScript('a'.repeat(DIRECT_STORY_TO_SCRIPT_MAX_CHARS + 1))).toBe(false)
  })
})
