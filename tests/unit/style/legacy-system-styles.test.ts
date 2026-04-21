import { describe, expect, it } from 'vitest'
import { ART_STYLES, getArtStylePrompt } from '@/lib/constants'
import { getLegacySystemStyle, getLegacySystemStyleById, listLegacySystemStyles } from '@/lib/style'

describe('legacy system styles', () => {
  it('projects every ART_STYLES entry as a read-only system style', () => {
    const styles = listLegacySystemStyles('zh')

    expect(styles).toHaveLength(ART_STYLES.length)

    for (const legacyStyle of ART_STYLES) {
      const style = styles.find((item) => item.legacyKey === legacyStyle.value)

      expect(style).toMatchObject({
        id: `system:${legacyStyle.value}`,
        source: 'system',
        legacyKey: legacyStyle.value,
        name: legacyStyle.label,
        label: legacyStyle.label,
        positivePrompt: getArtStylePrompt(legacyStyle.value, 'zh'),
        negativePrompt: null,
        readOnly: true,
      })
    }
  })

  it('returns locale-specific prompts for a stable legacy key', () => {
    const zhStyle = getLegacySystemStyle('american-comic', 'zh')
    const enStyle = getLegacySystemStyle('american-comic', 'en')

    expect(zhStyle).toMatchObject({
      id: 'system:american-comic',
      source: 'system',
      legacyKey: 'american-comic',
      positivePrompt: getArtStylePrompt('american-comic', 'zh'),
      negativePrompt: null,
      readOnly: true,
    })
    expect(enStyle?.label).toBe('Comic Style')
    expect(enStyle?.positivePrompt).toBe(getArtStylePrompt('american-comic', 'en'))
  })

  it('resolves runtime system asset ids back to localized system styles', () => {
    expect(getLegacySystemStyleById('system:american-comic', 'en')).toMatchObject({
      id: 'system:american-comic',
      label: 'Comic Style',
      positivePrompt: getArtStylePrompt('american-comic', 'en'),
    })
  })

  it('returns null for unknown legacy keys', () => {
    expect(getLegacySystemStyle('unknown-style', 'zh')).toBeNull()
  })
})
