export const DIRECT_STORY_TO_SCRIPT_MAX_CHARS = 120_000

export function canRunDirectStoryToScript(text: string): boolean {
  return text.trim().length <= DIRECT_STORY_TO_SCRIPT_MAX_CHARS
}
