import { describe, expect, it } from 'vitest'
import {
  classifyModelPurposeFromName,
  defaultFieldToPurpose,
  purposeToRuntimeType,
  shouldShowModelForDefaultField,
} from '@/lib/creative-engine/model-purpose'

describe('creative engine model purpose rules', () => {
  it('maps product purposes to existing runtime types', () => {
    expect(purposeToRuntimeType('text')).toBe('llm')
    expect(purposeToRuntimeType('image-generation')).toBe('image')
    expect(purposeToRuntimeType('image-edit')).toBe('image')
    expect(purposeToRuntimeType('video-generation')).toBe('video')
    expect(purposeToRuntimeType('voice-generation')).toBe('audio')
    expect(purposeToRuntimeType('lip-sync')).toBe('lipsync')
    expect(purposeToRuntimeType('voice-design')).toBe('audio')
  })

  it('filters default model fields by purpose', () => {
    expect(defaultFieldToPurpose('analysisModel')).toEqual(['text'])
    expect(defaultFieldToPurpose('characterModel')).toEqual(['image-generation'])
    expect(defaultFieldToPurpose('locationModel')).toEqual(['image-generation'])
    expect(defaultFieldToPurpose('storyboardModel')).toEqual(['image-generation'])
    expect(defaultFieldToPurpose('editModel')).toEqual(['image-edit'])
    expect(defaultFieldToPurpose('videoModel')).toEqual(['video-generation'])
    expect(defaultFieldToPurpose('audioModel')).toEqual(['voice-generation'])
    expect(defaultFieldToPurpose('lipSyncModel')).toEqual(['lip-sync'])
    expect(defaultFieldToPurpose('voiceDesignModel')).toEqual(['voice-design'])
  })

  it('does not expose mutable default purpose state', () => {
    const purposes = defaultFieldToPurpose('analysisModel')
    purposes.push('image-generation')

    expect(defaultFieldToPurpose('analysisModel')).toEqual(['text'])
  })

  it('keeps selectors strict and user-controlled', () => {
    expect(shouldShowModelForDefaultField({ purpose: 'image-edit', enabled: true, status: 'available' }, 'storyboardModel')).toBe(false)
    expect(shouldShowModelForDefaultField({ purpose: 'image-generation', enabled: true, status: 'available' }, 'storyboardModel')).toBe(true)
    expect(shouldShowModelForDefaultField({ purpose: 'voice-design', enabled: true, status: 'available' }, 'audioModel')).toBe(false)
    expect(shouldShowModelForDefaultField({ purpose: 'text', enabled: false, status: 'available' }, 'analysisModel')).toBe(false)
    expect(shouldShowModelForDefaultField({ purpose: 'text', enabled: true, status: 'failed' }, 'analysisModel')).toBe(false)
    expect(shouldShowModelForDefaultField({ purpose: 'text', enabled: true, status: 'disabled' }, 'analysisModel')).toBe(false)
  })

  it('classifies model names only as an editable initial guess', () => {
    expect(classifyModelPurposeFromName('claude-sonnet-4.5')).toMatchObject({ purpose: 'text', confidence: 'high' })
    expect(classifyModelPurposeFromName('doubao-seedream-4-0')).toMatchObject({ purpose: 'image-generation' })
    expect(classifyModelPurposeFromName('gpt-image-edit')).toMatchObject({ purpose: 'image-edit' })
    expect(classifyModelPurposeFromName('veo-3.1-fast')).toMatchObject({ purpose: 'video-generation' })
    expect(classifyModelPurposeFromName('fal-ai/veo3.1/fast/image-to-video')).toMatchObject({ purpose: 'video-generation' })
    expect(classifyModelPurposeFromName('qwen3-tts')).toMatchObject({ purpose: 'voice-generation' })
    expect(classifyModelPurposeFromName('kling-lipsync')).toMatchObject({ purpose: 'lip-sync' })
    expect(classifyModelPurposeFromName('qwen-voice-design')).toMatchObject({ purpose: 'voice-design' })
    expect(classifyModelPurposeFromName('vendor-mystery-model')).toMatchObject({ purpose: 'unknown', confidence: 'low' })
  })
})
