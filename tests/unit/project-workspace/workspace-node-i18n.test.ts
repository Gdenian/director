import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type ProjectWorkflowMessages = {
  readonly canvas?: {
    readonly workspace?: {
      readonly nodeFields?: Record<string, string>
    }
  }
}

const REPO_ROOT = process.cwd()
const WORKSPACE_NODE_PATH = join(REPO_ROOT, 'src/features/project-workspace/canvas/nodes/WorkspaceNode.tsx')

function readProjectWorkflowMessages(locale: 'en' | 'zh'): ProjectWorkflowMessages {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, `messages/${locale}/project-workflow.json`), 'utf8'),
  ) as ProjectWorkflowMessages
}

function readWorkspaceNodeFieldKeys(): readonly string[] {
  const source = readFileSync(WORKSPACE_NODE_PATH, 'utf8')
  return Array.from(source.matchAll(/labels\('([^']+)'/g), (match) => match[1])
    .filter((key): key is string => typeof key === 'string')
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .sort()
}

describe('WorkspaceNode i18n messages', () => {
  it('defines every nodeFields key used by the workspace canvas node renderer', () => {
    const usedKeys = readWorkspaceNodeFieldKeys()

    for (const locale of ['en', 'zh'] as const) {
      const messages = readProjectWorkflowMessages(locale)
      const nodeFields = messages.canvas?.workspace?.nodeFields
      expect(nodeFields, `${locale} projectWorkflow.canvas.workspace.nodeFields`).toBeDefined()

      const missingKeys = usedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(nodeFields, key))
      expect(missingKeys, `${locale} missing WorkspaceNode nodeFields`).toEqual([])
    }
  })
})
