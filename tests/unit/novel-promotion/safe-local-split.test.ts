import { describe, expect, it } from 'vitest'
import { splitLongTextLocally } from '@/lib/novel-promotion/safe-local-split'
import { DIRECT_STORY_TO_SCRIPT_MAX_CHARS } from '@/lib/novel-promotion/story-input-length'

describe('splitLongTextLocally', () => {
  it('splits overlarge text into direct-generation-safe episodes', () => {
    const text = [
      '第一段'.repeat(10_000),
      '第二段'.repeat(10_000),
      '第三段'.repeat(10_000),
      '第四段'.repeat(10_000),
      '第五段'.repeat(10_000),
    ].join('\n\n')

    const episodes = splitLongTextLocally(text)

    expect(episodes.length).toBeGreaterThan(1)
    expect(episodes.every((episode) => episode.content.length <= DIRECT_STORY_TO_SCRIPT_MAX_CHARS)).toBe(true)
    expect(episodes.map((episode) => episode.number)).toEqual(episodes.map((_, index) => index + 1))
    expect(episodes.map((episode) => episode.content).join('\n\n')).toBe(text)
  })
})
