import { describe, expect, it } from 'vitest'
import { parseEditorToolPlan } from '@/lib/novel-promotion/ai-editing/tool-plan'

describe('parseEditorToolPlan', () => {
  it('parses fenced JSON tool plans', () => {
    const result = parseEditorToolPlan(`
\`\`\`json
{
  "summary": "插入一段素材",
  "toolCalls": [
    { "tool": "get_timeline", "input": {} },
    { "tool": "get_media", "input": {} },
    { "tool": "insert_clips", "input": { "afterClipId": "clip-1", "mediaIds": ["media-1"] } }
  ]
}
\`\`\`
`)

    expect(result.summary).toBe('插入一段素材')
    expect(result.toolCalls).toEqual([
      { tool: 'get_timeline', input: {} },
      { tool: 'get_media', input: {} },
      { tool: 'insert_clips', input: { afterClipId: 'clip-1', mediaIds: ['media-1'] } },
    ])
  })

  it('rejects mutation before timeline and media reads', () => {
    expect(() => parseEditorToolPlan(JSON.stringify({
      toolCalls: [
        { tool: 'get_timeline', input: {} },
        { tool: 'insert_clips', input: { mediaIds: ['media-1'] } },
      ],
    }))).toThrow('EDITOR_TOOL_PLAN_MISSING_CONTEXT_READS')
  })

  it('rejects unknown tools', () => {
    expect(() => parseEditorToolPlan(JSON.stringify({
      toolCalls: [
        { tool: 'get_timeline', input: {} },
        { tool: 'get_media', input: {} },
        { tool: 'rotate_clip', input: {} },
      ],
    }))).toThrow('EDITOR_TOOL_PLAN_INVALID_TOOL')
  })

  it('rejects ripple delete ranges without ranges input', () => {
    expect(() => parseEditorToolPlan(JSON.stringify({
      toolCalls: [
        { tool: 'get_timeline', input: {} },
        { tool: 'get_media', input: {} },
        { tool: 'ripple_delete_ranges', input: {} },
      ],
    }))).toThrow('EDITOR_TOOL_PLAN_INVALID_INPUT')
  })

  it('rejects insert clips without media ids', () => {
    expect(() => parseEditorToolPlan(JSON.stringify({
      toolCalls: [
        { tool: 'get_timeline', input: {} },
        { tool: 'get_media', input: {} },
        { tool: 'insert_clips', input: {} },
      ],
    }))).toThrow('EDITOR_TOOL_PLAN_INVALID_INPUT')
  })

  it('rejects remove clips without clip ids', () => {
    expect(() => parseEditorToolPlan(JSON.stringify({
      toolCalls: [
        { tool: 'get_timeline', input: {} },
        { tool: 'get_media', input: {} },
        { tool: 'remove_clips', input: {} },
      ],
    }))).toThrow('EDITOR_TOOL_PLAN_INVALID_INPUT')
  })

  it('repairs mixed LLM text and single quoted JSON', () => {
    const result = parseEditorToolPlan(`
Here is the plan:
{
  summary: 'AI 剪辑调整',
  toolCalls: [
    { tool: 'get_timeline', input: null },
    { tool: 'get_media', input: {} }
  ],
}
`)

    expect(result.summary).toBe('AI 剪辑调整')
    expect(result.toolCalls).toEqual([
      { tool: 'get_timeline', input: {} },
      { tool: 'get_media', input: {} },
    ])
  })
})
