import { describe, expect, it } from 'vitest'
import { findCreativeEngineUsageImpact } from '@/lib/creative-engine/usage-impact'

describe('creative engine usage impact', () => {
  it('reports user defaults and project selections affected by engine deletion', () => {
    const impact = findCreativeEngineUsageImpact({
      target: { type: 'engine', engineId: 'engine-1' },
      models: [
        { modelKey: 'engine-1::gpt-5', engineId: 'engine-1', name: 'GPT 5' },
        { modelKey: 'engine-1::veo', engineId: 'engine-1', name: 'Veo' },
        { modelKey: 'engine-2::tts', engineId: 'engine-2', name: 'TTS' },
      ],
      userDefaults: {
        analysisModel: 'engine-1::gpt-5',
        audioModel: 'engine-2::tts',
      },
      projects: [
        {
          projectId: 'p1',
          title: 'Project A',
          videoModel: 'engine-1::veo',
          audioModel: 'engine-2::tts',
        },
      ],
    })

    expect(impact).toEqual({
      affectedCount: 2,
      items: [
        {
          scope: 'user-default',
          field: 'analysisModel',
          label: '文本分析模型',
          modelKey: 'engine-1::gpt-5',
          modelName: 'GPT 5',
        },
        {
          scope: 'project',
          projectId: 'p1',
          projectTitle: 'Project A',
          field: 'videoModel',
          label: '视频生成模型',
          modelKey: 'engine-1::veo',
          modelName: 'Veo',
        },
      ],
    })
  })

  it('reports only the selected model for model-level impact', () => {
    const impact = findCreativeEngineUsageImpact({
      target: { type: 'model', modelKey: 'engine-1::edit' },
      models: [
        { modelKey: 'engine-1::gpt-5', engineId: 'engine-1', name: 'GPT 5' },
        { modelKey: 'engine-1::edit', engineId: 'engine-1', name: 'Edit Pro' },
      ],
      userDefaults: {
        analysisModel: 'engine-1::gpt-5',
        editModel: 'engine-1::edit',
      },
      projects: [
        {
          projectId: 'p1',
          title: 'Project A',
          editModel: 'engine-1::edit',
        },
      ],
    })

    expect(impact).toEqual({
      affectedCount: 2,
      items: [
        {
          scope: 'user-default',
          field: 'editModel',
          label: '图片编辑模型',
          modelKey: 'engine-1::edit',
          modelName: 'Edit Pro',
        },
        {
          scope: 'project',
          projectId: 'p1',
          projectTitle: 'Project A',
          field: 'editModel',
          label: '图片编辑模型',
          modelKey: 'engine-1::edit',
          modelName: 'Edit Pro',
        },
      ],
    })
  })

  it('returns an empty impact result when no selection references the target', () => {
    const impact = findCreativeEngineUsageImpact({
      target: { type: 'engine', engineId: 'engine-3' },
      models: [
        { modelKey: 'engine-1::gpt-5', engineId: 'engine-1', name: 'GPT 5' },
      ],
      userDefaults: { analysisModel: 'engine-1::gpt-5' },
      projects: [{ projectId: 'p1', title: 'Project A', videoModel: null }],
    })

    expect(impact).toEqual({ affectedCount: 0, items: [] })
  })
})
