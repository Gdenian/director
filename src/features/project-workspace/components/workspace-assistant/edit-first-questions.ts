'use client'

import type {
  EditBriefOptionId,
  EditScriptBriefQuestion,
} from '@/lib/edit-script/types'

export type EditFirstQuestion = EditScriptBriefQuestion

export interface EditFirstAnswer {
  readonly questionId: string
  readonly questionLabel: string
  readonly optionId: EditBriefOptionId
  readonly optionLabel: string
}

export function buildEditFirstPromptWithAnswers(input: {
  readonly originalPrompt: string
  readonly answerSectionTitle: string
  readonly answers: readonly string[]
}): string {
  const normalizedPrompt = input.originalPrompt.trim()
  const answerSectionTitle = input.answerSectionTitle.trim()
  const answerLines = input.answers
    .map((answer) => answer.trim())
    .filter(Boolean)
    .map((answer) => `- ${answer}`)

  if (answerLines.length === 0) return normalizedPrompt
  return [
    normalizedPrompt,
    '',
    answerSectionTitle,
    ...answerLines,
  ].join('\n')
}
