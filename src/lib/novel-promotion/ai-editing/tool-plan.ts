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

    const input = isPlainObject(rawCall.input) ? rawCall.input : {}
    validateToolInput(tool, input)

    return {
      tool,
      input,
    }
  })

  return { summary, toolCalls }
}

function validateToolInput(tool: EditorToolName, input: Record<string, unknown>): void {
  switch (tool) {
    case 'add_clips':
    case 'insert_clips':
      requireStringArray(input.mediaIds)
      return
    case 'remove_clips':
      requireStringArray(input.clipIds)
      return
    case 'move_clips':
      requireStringArray(input.clipIds)
      requireNumber(input.toIndex)
      return
    case 'replace_clip':
      requireString(input.clipId)
      requireString(input.mediaId)
      return
    case 'set_clip_properties':
      requireString(input.clipId)
      return
    case 'split_clip':
      requireString(input.clipId)
      requireNumber(input.atFrame)
      return
    case 'ripple_delete_ranges':
      requireRanges(input.ranges)
      return
    case 'inspect_media':
      requireString(input.mediaId)
      return
    default:
      return
  }
}

function requireString(value: unknown): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('EDITOR_TOOL_PLAN_INVALID_INPUT')
  }
}

function requireNumber(value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('EDITOR_TOOL_PLAN_INVALID_INPUT')
  }
}

function requireStringArray(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error('EDITOR_TOOL_PLAN_INVALID_INPUT')
  }
}

function requireRanges(value: unknown): void {
  if (!Array.isArray(value) || value.some((range) => (
    !isPlainObject(range)
    || typeof range.startFrame !== 'number'
    || !Number.isFinite(range.startFrame)
    || typeof range.endFrame !== 'number'
    || !Number.isFinite(range.endFrame)
  ))) {
    throw new Error('EDITOR_TOOL_PLAN_INVALID_INPUT')
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
