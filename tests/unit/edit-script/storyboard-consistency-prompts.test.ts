import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

function readPrompt(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('edit-script storyboard consistency prompts', () => {
  it('limits grid vision coordinates to visible character entries', () => {
    const zh = readPrompt('src/lib/ai-prompts/templates/edit-script/storyboard-grid-vision/edit-script-storyboard-grid-vision.zh.txt')
    const en = readPrompt('src/lib/ai-prompts/templates/edit-script/storyboard-grid-vision/edit-script-storyboard-grid-vision.en.txt')

    expect(zh).toContain('"kind": "character"')
    expect(en).toContain('"kind": "character"')
    expect(zh).toContain('coordinates 只允许写人物坐标')
    expect(en).toContain('coordinates may contain character coordinates only')
    expect(zh).not.toContain('kind": "character | anchor')
    expect(en).not.toContain('kind": "character | anchor')
    expect(zh).not.toContain('输出角色、空间锚点、朝向')
    expect(en).not.toContain('output character, anchor, facing')
  })

  it('keeps environmental anchors as text references in camera prompts', () => {
    const zhBlock = readPrompt('src/lib/ai-prompts/templates/edit-script/storyboard-camera-plan-block/edit-script-storyboard-camera-plan-block.zh.txt')
    const enBlock = readPrompt('src/lib/ai-prompts/templates/edit-script/storyboard-camera-plan-block/edit-script-storyboard-camera-plan-block.en.txt')
    const zhLegacy = readPrompt('src/lib/ai-prompts/templates/edit-script/storyboard-camera-plan/edit-script-storyboard-camera-plan.zh.txt')
    const enLegacy = readPrompt('src/lib/ai-prompts/templates/edit-script/storyboard-camera-plan/edit-script-storyboard-camera-plan.en.txt')

    expect(zhBlock).toContain('环境锚点只能作为 cinematicTranslation 中的文字参照')
    expect(enBlock).toContain('Environmental anchors may only be textual references inside cinematicTranslation')
    expect(zhLegacy).toContain('环境锚点只能作为文字参照')
    expect(enLegacy).toContain('Environmental anchors may only be textual references')
    expect(zhBlock).not.toContain('人物、锚点、朝向')
    expect(enBlock).not.toContain('character, anchor, facing')
  })
})
