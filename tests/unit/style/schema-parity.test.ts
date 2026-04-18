import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const schemaPaths = [
  ['mysql', 'prisma/schema.prisma'],
  ['sqlite', 'prisma/schema.sqlit.prisma'],
] as const

function readSchema(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function getModelBlock(schema: string, modelName: string) {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`))
  return match?.[0] ?? ''
}

describe('style schema parity', () => {
  it.each(schemaPaths)('%s schema defines the GlobalStyle asset contract', (_name, path) => {
    const schema = readSchema(path)
    const styleBlock = getModelBlock(schema, 'GlobalStyle')

    expect(schema).toContain('model GlobalStyle')
    expect(styleBlock).toContain('@@map("global_styles")')
    expect(styleBlock).toContain('previewMediaId String?')
    expect(styleBlock).toContain('GlobalStylePreviewMedia')
    expect(styleBlock).toContain('@@index([previewMediaId])')

    for (const forbiddenField of ['previewUrl', 'previewImageUrl', 'previewStorageKey', 'signedUrl']) {
      expect(styleBlock).not.toContain(forbiddenField)
    }
  })

  it.each(schemaPaths)('%s schema keeps project legacy fields and adds style asset reference', (_name, path) => {
    const schema = readSchema(path)
    const projectBlock = getModelBlock(schema, 'NovelPromotionProject')

    expect(projectBlock).toContain('styleAssetId String?')
    expect(projectBlock).toContain('styleAsset GlobalStyle?')
    expect(projectBlock).toContain('@@index([styleAssetId])')
    expect(projectBlock).toContain('artStyle        String')
    expect(projectBlock).toContain('artStylePrompt')
  })
})
