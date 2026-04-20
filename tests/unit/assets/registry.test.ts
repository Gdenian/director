import { describe, expect, it } from 'vitest'
import { assetKindRegistry, getAssetKindRegistration } from '@/lib/assets/kinds/registry'

describe('asset kind registry', () => {
  it('declares the supported asset kinds with stable capability contracts', () => {
    expect(Object.keys(assetKindRegistry)).toEqual(['character', 'location', 'prop', 'voice', 'style'])
    expect(getAssetKindRegistration('character')).toEqual(expect.objectContaining({
      kind: 'character',
      family: 'visual',
      supportsMultipleVariants: true,
      supportsVoiceBinding: true,
      capabilities: expect.objectContaining({
        canGenerate: true,
        canBindVoice: true,
      }),
    }))
    expect(getAssetKindRegistration('location')).toEqual(expect.objectContaining({
      kind: 'location',
      family: 'visual',
      supportsMultipleVariants: true,
      supportsVoiceBinding: false,
    }))
    expect(getAssetKindRegistration('prop')).toEqual(expect.objectContaining({
      kind: 'prop',
      family: 'visual',
      supportsMultipleVariants: true,
      supportsVoiceBinding: false,
      capabilities: expect.objectContaining({
        canGenerate: true,
        canSelectRender: true,
        canCopyFromGlobal: true,
      }),
    }))
    expect(getAssetKindRegistration('voice')).toEqual(expect.objectContaining({
      kind: 'voice',
      family: 'audio',
      supportsMultipleVariants: false,
      capabilities: expect.objectContaining({
        canGenerate: false,
        canSelectRender: false,
      }),
    }))
    expect(getAssetKindRegistration('style')).toEqual({
      kind: 'style',
      family: 'visual',
      supportsMultipleVariants: false,
      supportsVoiceBinding: false,
      editorSchema: 'style',
      promptAssembler: 'style',
      capabilities: {
        canGenerate: false,
        canSelectRender: false,
        canRevertRender: false,
        canModifyRender: false,
        canUploadRender: false,
        canBindVoice: false,
        canCopyFromGlobal: false,
      },
    })
  })
})
