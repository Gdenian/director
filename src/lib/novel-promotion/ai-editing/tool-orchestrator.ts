import type OpenAI from 'openai'
import type { VideoEditorProject } from '@/features/video-editor/types/editor.types'
import { getCompletionContent } from '@/lib/llm-client'
import type { ChatCompletionOptions, ChatMessage } from '@/lib/llm/types'
import { runModelGatewayTextCompletion } from '@/lib/model-gateway/llm'
import { EditorToolExecutor } from './tool-executor'
import { parseEditorToolPlan } from './tool-plan'
import type {
  AiEditableMediaLibrary,
  EditorToolDraftResult,
  EditorToolPlanCall,
  InsertClipsInput,
  MoveClipsInput,
  ReplaceClipInput,
  RippleDeleteRangesInput,
  SetClipPropertiesInput,
  SplitClipInput,
} from './tool-types'

const MAX_TOOL_CALLS = 20
const TRUNCATED_WARNING = 'EDITOR_TOOL_PLAN_TRUNCATED_TO_20_CALLS'

export type EditorToolComplete = (input: {
  userId: string
  model: string
  messages: ChatMessage[]
  options?: ChatCompletionOptions
}) => Promise<string | OpenAI.Chat.Completions.ChatCompletion>

export type RunEditorToolOrchestratorInput = {
  project: VideoEditorProject
  media: AiEditableMediaLibrary
  instruction: string
  userId: string
  model: string
  options?: ChatCompletionOptions
  complete?: EditorToolComplete
}

export type EditorToolOrchestratorResult = EditorToolDraftResult & {
  summary: string
}

export async function runEditorToolOrchestrator(input: RunEditorToolOrchestratorInput): Promise<EditorToolOrchestratorResult> {
  const complete = input.complete ?? defaultComplete
  const completion = await complete({
    userId: input.userId,
    model: input.model,
    messages: buildEditorToolPrompt(input),
    options: input.options,
  })
  const content = typeof completion === 'string'
    ? completion
    : getCompletionContent(completion)
  const plan = parseEditorToolPlan(content || '')
  const executor = new EditorToolExecutor({
    project: input.project,
    media: input.media,
  })
  const warnings: string[] = []
  const callsToRun = plan.toolCalls.slice(0, MAX_TOOL_CALLS)
  let lastDraftResult: EditorToolDraftResult | null = null

  if (plan.toolCalls.length > MAX_TOOL_CALLS) {
    warnings.push(TRUNCATED_WARNING)
  }

  for (const call of callsToRun) {
    const result = executeCall(executor, call)
    if (result) {
      lastDraftResult = result
    }
  }

  const draft = lastDraftResult ?? unchangedDraft(input.project, warnings)
  return {
    ...draft,
    warnings: lastDraftResult ? [...draft.warnings, ...warnings] : draft.warnings,
    summary: plan.summary,
  }
}

function buildEditorToolPrompt(input: RunEditorToolOrchestratorInput): ChatMessage[] {
  return [{
    role: 'system',
    content: [
      '你是 AI 视频剪辑工具编排器。',
      '只输出 JSON，不要输出 Markdown 解释，不要输出完整项目 JSON。',
      '输出格式：{"summary":"一句中文摘要","toolCalls":[{"tool":"get_timeline","input":{}}]}。',
      'mutation 工具前必须先调用 get_timeline 和 get_media。',
      '保持剧情连贯，只做符合用户指令的小范围修改。',
      '可用工具：get_timeline, get_media, inspect_media, add_clips, insert_clips, replace_clip, set_clip_properties, move_clips, split_clip, remove_clips, ripple_delete_ranges, get_transcript, add_captions, undo。',
    ].join('\n'),
  }, {
    role: 'user',
    content: JSON.stringify({
      instruction: input.instruction,
      timeline: input.project.timeline,
      audioTrack: input.project.audioTrack,
      subtitleCues: input.project.subtitleCues,
      media: input.media,
    }),
  }]
}

async function defaultComplete(input: Parameters<EditorToolComplete>[0]): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return await runModelGatewayTextCompletion(input)
}

function executeCall(executor: EditorToolExecutor, call: EditorToolPlanCall): EditorToolDraftResult | null {
  switch (call.tool) {
    case 'get_timeline':
      executor.getTimeline()
      return null
    case 'get_media':
      executor.getMedia()
      return null
    case 'inspect_media':
      executor.inspectMedia({ mediaId: asString(call.input.mediaId) })
      return null
    case 'get_transcript':
      executor.getTranscript()
      return null
    case 'add_clips':
    case 'insert_clips':
      return executor.insertClips(call.input as InsertClipsInput)
    case 'replace_clip':
      return executor.replaceClip(call.input as ReplaceClipInput)
    case 'set_clip_properties':
      return executor.setClipProperties(call.input as SetClipPropertiesInput)
    case 'move_clips':
      return executor.moveClips(call.input as MoveClipsInput)
    case 'split_clip':
      return executor.splitClip(call.input as SplitClipInput)
    case 'remove_clips':
      return removeClips(executor, call.input)
    case 'ripple_delete_ranges':
      return executor.rippleDeleteRanges(call.input as RippleDeleteRangesInput)
    case 'add_captions':
      return executor.addCaptions(call.input)
    case 'undo':
      return executor.undo()
  }
}

function removeClips(executor: EditorToolExecutor, input: Record<string, unknown>): EditorToolDraftResult {
  const clipIds = Array.isArray(input.clipIds)
    ? input.clipIds.filter((clipId): clipId is string => typeof clipId === 'string')
    : []
  const timeline = executor.getTimeline()
  const ranges = timeline.clips
    .filter((clip) => clipIds.includes(clip.id))
    .map((clip) => ({ startFrame: clip.startFrame, endFrame: clip.endFrame }))

  return executor.rippleDeleteRanges({ ranges })
}

function unchangedDraft(project: VideoEditorProject, warnings: string[]): EditorToolDraftResult {
  return {
    project: structuredClone(project),
    operations: [],
    warnings,
    changed: false,
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
