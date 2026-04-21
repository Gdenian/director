import { describe, expect, it } from 'vitest'
import {
  mapGlobalStyleToAsset,
  mapGlobalVoiceToAsset,
  mapProjectCharacterToAsset,
  mapProjectPropToAsset,
} from '@/lib/assets/mappers'
import { groupAssetsByKind } from '@/lib/assets/grouping'

describe('asset mappers', () => {
  it('maps project characters into the unified character asset contract', () => {
    const asset = mapProjectCharacterToAsset({
      id: 'character-1',
      name: '林夏',
      introduction: '主角',
      profileData: JSON.stringify({ archetype: 'lead' }),
      voiceType: 'custom',
      voiceId: 'voice-1',
      customVoiceUrl: 'https://example.com/voice.mp3',
      media: null,
      profileConfirmed: true,
      appearances: [
        {
          id: 'appearance-1',
          appearanceIndex: 0,
          changeReason: '初始形象',
          description: '短发，风衣',
          imageUrl: 'https://example.com/char.jpg',
          media: null,
          imageUrls: ['https://example.com/char.jpg'],
          imageMedias: [],
          selectedIndex: 0,
          previousImageUrl: null,
          previousMedia: null,
          previousImageUrls: [],
          previousImageMedias: [],
        },
      ],
    })

    expect(asset).toEqual(expect.objectContaining({
      id: 'character-1',
      scope: 'project',
      kind: 'character',
      introduction: '主角',
      profileData: JSON.stringify({ archetype: 'lead' }),
      profileConfirmed: true,
      voice: expect.objectContaining({
        voiceType: 'custom',
        voiceId: 'voice-1',
      }),
    }))
    expect(asset.variants[0]).toEqual(expect.objectContaining({
      id: 'appearance-1',
      index: 0,
      label: '初始形象',
    }))
  })

  it('maps global voices into the unified audio asset contract', () => {
    const asset = mapGlobalVoiceToAsset({
      id: 'voice-1',
      name: '旁白',
      description: '低沉稳重',
      voiceId: 'voice-provider-1',
      voiceType: 'designed',
      customVoiceUrl: 'https://example.com/voice.mp3',
      media: null,
      voicePrompt: '低沉稳重',
      gender: 'male',
      language: 'zh',
      folderId: 'folder-1',
    })

    expect(asset).toEqual(expect.objectContaining({
      id: 'voice-1',
      scope: 'global',
      kind: 'voice',
      voiceMeta: expect.objectContaining({
        voiceType: 'designed',
        gender: 'male',
        language: 'zh',
      }),
    }))
  })

  it('maps project props into the unified visual asset contract and groups them by kind', () => {
    const propAsset = mapProjectPropToAsset({
      id: 'prop-1',
      name: '青铜匕首',
      summary: '古旧短刃，雕纹手柄',
      images: [
        {
          id: 'prop-image-1',
          imageIndex: 0,
          description: '古旧短刃，雕纹手柄',
          imageUrl: 'https://example.com/prop.jpg',
          media: null,
          previousImageUrl: null,
          previousMedia: null,
          isSelected: true,
        },
      ],
    })
    const voiceAsset = mapGlobalVoiceToAsset({
      id: 'voice-1',
      name: '旁白',
      description: '低沉稳重',
      voiceId: 'voice-provider-1',
      voiceType: 'designed',
      customVoiceUrl: 'https://example.com/voice.mp3',
      media: null,
      voicePrompt: '低沉稳重',
      gender: 'male',
      language: 'zh',
      folderId: 'folder-1',
    })

    expect(propAsset).toEqual(expect.objectContaining({
      id: 'prop-1',
      scope: 'project',
      kind: 'prop',
      summary: '古旧短刃，雕纹手柄',
      selectedVariantId: 'prop-image-1',
    }))
    expect(propAsset.variants[0]).toEqual(expect.objectContaining({
      id: 'prop-image-1',
      index: 0,
      description: '古旧短刃，雕纹手柄',
    }))

    const groups = groupAssetsByKind([propAsset, voiceAsset])
    expect(groups.prop.map((asset) => asset.id)).toEqual(['prop-1'])
    expect(groups.voice.map((asset) => asset.id)).toEqual(['voice-1'])
  })

  it('maps global styles into the unified style asset contract with public preview media only', () => {
    const asset = mapGlobalStyleToAsset({
      id: 'style-1',
      userId: 'user-1',
      folderId: 'folder-1',
      name: '冷峻赛博',
      description: '偏冷色的赛博夜景',
      positivePrompt: 'cyberpunk neon city',
      negativePrompt: 'blurry',
      tags: '["赛博","冷色"]',
      source: 'user',
      legacyKey: null,
      previewMedia: {
        id: 'media-1',
        publicId: 'style-preview',
        storageKey: 'internal/style-preview.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        width: 512,
        height: 512,
        durationMs: null,
        sha256: 'secret',
        updatedAt: '2026-04-20T00:00:00.000Z',
      },
    })

    expect(asset).toEqual(expect.objectContaining({
      id: 'style-1',
      scope: 'global',
      kind: 'style',
      family: 'visual',
      folderId: 'folder-1',
      description: '偏冷色的赛博夜景',
      positivePrompt: 'cyberpunk neon city',
      negativePrompt: 'blurry',
      tags: ['赛博', '冷色'],
      source: 'user',
      legacyKey: null,
      readOnly: false,
      previewMedia: expect.objectContaining({
        id: 'media-1',
        publicId: 'style-preview',
        url: '/m/style-preview',
        mimeType: 'image/png',
        sizeBytes: 1024,
        width: 512,
        height: 512,
        durationMs: null,
      }),
    }))
    expect(asset.previewMedia).not.toHaveProperty('storageKey')
  })
})
