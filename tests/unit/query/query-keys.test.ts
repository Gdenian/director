import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/query/keys'

describe('queryKeys locale awareness', () => {
  it('includes locale in global style asset list keys', () => {
    expect(queryKeys.assets.list({
      scope: 'global',
      kind: 'style',
      locale: 'zh',
    })).not.toEqual(queryKeys.assets.list({
      scope: 'global',
      kind: 'style',
      locale: 'en',
    }))
  })

  it('includes locale in project data keys while preserving prefix shape', () => {
    expect(queryKeys.projectData('project-1', 'zh')).toEqual(['project-data', 'project-1', 'zh'])
    expect(queryKeys.projectData('project-1', 'en')).toEqual(['project-data', 'project-1', 'en'])
    expect(queryKeys.projectData('project-1')).toEqual(['project-data', 'project-1'])
  })
})
