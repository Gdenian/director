import type {
  EditAssetRequirement,
  EditScriptPayload,
  EditScriptShot,
} from './types'
import { normalizeVideoBlockPlanResponse } from '@/lib/video-groups/planner'
import {
  editAssetExtractionSchema,
  editScriptCoreSchema,
} from './types'

function uniquePositiveNumbers(values: readonly number[]): number[] {
  const seen = new Set<number>()
  const output: number[] = []
  values.forEach((value) => {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) return
    seen.add(value)
    output.push(value)
  })
  return output.sort((left, right) => left - right)
}

export function normalizeEditScriptCore(raw: unknown): Omit<EditScriptPayload, 'requirements'> {
  const parsed = editScriptCoreSchema.parse(raw)

  const shots: EditScriptShot[] = parsed.shots
    .map((shot) => ({
      shotNumber: shot.shotNumber,
      durationSec: shot.durationSec,
      visualAction: shot.visualAction.trim(),
      charactersAndScene: shot.charactersAndScene.trim(),
      camera: shot.camera.trim(),
      videoPrompt: shot.videoPrompt.trim(),
      sound: shot.sound.trim(),
    }))
    .sort((left, right) => left.shotNumber - right.shotNumber)

  shots.forEach((shot, index) => {
    const expectedNumber = index + 1
    if (shot.shotNumber !== expectedNumber) {
      throw new Error(`EDIT_SCRIPT_SHOT_NUMBER_NOT_CONTINUOUS:${shot.shotNumber}:${expectedNumber}`)
    }
  })

  const durationSec = shots.reduce((total, shot) => total + shot.durationSec, 0)
  const videoBlocks = normalizeVideoBlockPlanResponse({
    response: { items: parsed.videoBlocks },
    allShotNumbers: shots.map((shot) => shot.shotNumber),
    shots,
  }).items
  return {
    title: parsed.title.trim(),
    logline: parsed.logline?.trim() || null,
    durationSec,
    shotCount: shots.length,
    shots,
    videoBlocks,
  }
}

export function normalizeEditAssetRequirements(
  raw: unknown,
  shots: readonly EditScriptShot[],
): EditAssetRequirement[] {
  const parsed = editAssetExtractionSchema.parse(raw)
  const validShotNumbers = new Set(shots.map((shot) => shot.shotNumber))
  const seen = new Set<string>()
  const assets: EditAssetRequirement[] = []

  parsed.assets.forEach((asset) => {
    const name = asset.name.trim()
    const key = `${asset.kind}:${name.toLocaleLowerCase()}`
    if (seen.has(key)) return
    const shotNumbers = uniquePositiveNumbers(asset.shotNumbers)
      .filter((shotNumber) => validShotNumbers.has(shotNumber))
    if (shotNumbers.length === 0) {
      throw new Error(`EDIT_SCRIPT_ASSET_HAS_NO_VALID_SHOTS:${asset.kind}:${name}`)
    }
    seen.add(key)
    assets.push({
      kind: asset.kind,
      name,
      description: asset.description.trim(),
      shotNumbers,
      status: 'pending',
      targetId: null,
      errorMessage: null,
    })
  })

  if (assets.length === 0) {
    throw new Error('EDIT_SCRIPT_ASSET_EXTRACTION_EMPTY')
  }

  return assets
}

export function resolveEditScriptDefaults(userPrompt: string): { durationSeconds: number } {
  const text = userPrompt.trim()
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|minute|minutes|min)/i)
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1])
    if (Number.isFinite(minutes) && minutes > 0) {
      const durationSeconds = Math.max(10, Math.round(minutes * 60))
      return { durationSeconds }
    }
  }

  const secondMatch = text.match(/(\d+)\s*(?:秒|second|seconds|sec|s)/i)
  if (secondMatch) {
    const durationSeconds = Number(secondMatch[1])
    if (Number.isInteger(durationSeconds) && durationSeconds > 0) {
      return { durationSeconds }
    }
  }

  return { durationSeconds: 60 }
}
