import { safeParseJsonObject } from '@/lib/json-repair'
import type { EditorToolName, EditorToolPlan, EditorToolPlanCall } from './tool-types'

const DEFAULT_SUMMARY = 'AI 剪辑调整'

const EDITOR_TOOL_NAMES = new Set<EditorToolName>([
  'get_timeline',
  'get_media',
  'inspect_media',
  'add_clips',
  'insert_clips',
  'replace_clip',
  'set_clip_properties',
  'move_clips',
  'split_clip',
  'remove_clips',
  'ripple_delete_ranges',
  'get_transcript',
  'add_captions',
  'undo',
])

const MUTATION_TOOLS = new Set<EditorToolName>([
  'add_clips',
  'insert_clips',
  'replace_clip',
  'set_clip_properties',
  'move_clips',
  'split_clip',
  'remove_clips',
  'ripple_delete_ranges',
  'add_captions',
  'undo',
])

export function parseEditorToolPlan(content: string): EditorToolPlan {
  const parsed = safeParseJsonObject(content)
  const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
    ? parsed.summary.trim()
    : DEFAULT_SUMMARY
  const rawToolCalls = parsed.toolCalls

  if (!Array.isArray(rawToolCalls)) {
    throw new Error('EDITOR_TOOL_PLAN_INVALID_SHAPE')
  }

  let hasTimelineRead = false
  let hasMediaRead = false
  const toolCalls: EditorToolPlanCall[] = rawToolCalls.map((rawCall) => {
    if (!isPlainObject(rawCall)) {
      throw new Error('EDITOR_TOOL_PLAN_INVALID_SHAPE')
    }

    const rawTool = rawCall.tool
    if (typeof rawTool !== 'string' || !EDITOR_TOOL_NAMES.has(rawTool as EditorToolName)) {
      throw new Error('EDITOR_TOOL_PLAN_INVALID_TOOL')
    }

    const tool = rawTool as EditorToolName
    if (MUTATION_TOOLS.has(tool) && (!hasTimelineRead || !hasMediaRead)) {
      throw new Error('EDITOR_TOOL_PLAN_MISSING_CONTEXT_READS')
    }

    if (tool === 'get_timeline') hasTimelineRead = true
    if (tool === 'get_media') hasMediaRead = true

    return {
      tool,
      input: isPlainObject(rawCall.input) ? rawCall.input : {},
    }
  })

  return { summary, toolCalls }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
