import { countWords } from '@/lib/word-count'
import { DIRECT_STORY_TO_SCRIPT_MAX_CHARS } from '@/lib/novel-promotion/story-input-length'

export interface LocalSplitEpisode {
  number: number
  title: string
  summary: string
  content: string
  wordCount: number
}

function pushChunk(chunks: string[], chunk: string) {
  if (chunk.length > 0) {
    chunks.push(chunk)
  }
}

function splitOversizedPart(part: string, maxChars: number): string[] {
  const chunks: string[] = []
  for (let start = 0; start < part.length; start += maxChars) {
    pushChunk(chunks, part.slice(start, start + maxChars))
  }
  return chunks
}

export function splitLongTextLocally(
  rawText: string,
  maxChars = DIRECT_STORY_TO_SCRIPT_MAX_CHARS,
): LocalSplitEpisode[] {
  const text = rawText.trim()
  if (!text) return []

  const chunks: string[] = []
  let current = ''

  for (const part of text.split(/\n{2,}/)) {
    const separator = current ? '\n\n' : ''
    if (part.length > maxChars) {
      pushChunk(chunks, current)
      current = ''
      chunks.push(...splitOversizedPart(part, maxChars))
      continue
    }

    if (current.length + separator.length + part.length > maxChars) {
      pushChunk(chunks, current)
      current = part
      continue
    }

    current = `${current}${separator}${part}`
  }

  pushChunk(chunks, current)

  return chunks.map((content, index) => ({
    number: index + 1,
    title: `第 ${index + 1} 集`,
    summary: '',
    content,
    wordCount: countWords(content),
  }))
}
