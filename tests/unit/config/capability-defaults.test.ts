import { describe, expect, it } from 'vitest'
import { ensureCapabilityDefaultsForModels } from '@/components/ui/config-modals/ConfigEditModal'

describe('config capability defaults', () => {
  it('writes visible model parameter defaults into capability overrides', () => {
    const result = ensureCapabilityDefaultsForModels({
      capabilityOverrides: {
        'ark::doubao-seedance-2-0-fast-260128': {
          resolution: '720p',
        },
      },
      targets: [
        {
          modelKey: 'ark::doubao-seedance-2-0-fast-260128',
          fields: [
            { field: 'generateAudio', label: 'Generate audio', options: [true, false] },
            { field: 'resolution', label: 'Resolution', options: ['480p', '720p'] },
          ],
        },
      ],
    })

    expect(result.changed).toBe(true)
    expect(result.capabilityOverrides).toEqual({
      'ark::doubao-seedance-2-0-fast-260128': {
        generateAudio: true,
        resolution: '720p',
      },
    })
  })

  it('does not rewrite complete model parameter selections', () => {
    const result = ensureCapabilityDefaultsForModels({
      capabilityOverrides: {
        'ark::doubao-seedance-2-0-fast-260128': {
          generateAudio: false,
          resolution: '480p',
        },
      },
      targets: [
        {
          modelKey: 'ark::doubao-seedance-2-0-fast-260128',
          fields: [
            { field: 'generateAudio', label: 'Generate audio', options: [true, false] },
            { field: 'resolution', label: 'Resolution', options: ['480p', '720p'] },
          ],
        },
      ],
    })

    expect(result.changed).toBe(false)
    expect(result.capabilityOverrides).toEqual({
      'ark::doubao-seedance-2-0-fast-260128': {
        generateAudio: false,
        resolution: '480p',
      },
    })
  })
})
