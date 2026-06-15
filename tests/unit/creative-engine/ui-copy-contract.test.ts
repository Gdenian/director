import { describe, expect, it } from 'vitest'
import zhApiConfig from '../../../messages/zh/apiConfig.json'
import enApiConfig from '../../../messages/en/apiConfig.json'
import zhProfile from '../../../messages/zh/profile.json'

const forbiddenZh = [
  '生成默认方案',
  '自动配置创作方案',
  '已为你选择最佳模型',
  '已自动分配模型',
  '自动决策',
  '自动分配模型',
]

describe('creative engine UI copy contract', () => {
  it('renames profile navigation and main module', () => {
    expect(zhProfile.apiConfig).toBe('创作引擎')
    expect(zhProfile.modelSelection).toBe('模型选择')
    expect(zhApiConfig.title).toBe('创作引擎')
    expect(zhApiConfig.providerPool).toBe('已接入的服务')
    expect(zhApiConfig.defaultModels).toBe('模型选择')
    expect(enApiConfig.title).toBe('Creative Engine')
  })

  it('contains required disclosure and confirmation copy', () => {
    expect(zhApiConfig.creativeEngine.description).toBe('接入你已有的 AI 服务，并在创作流程中选择需要使用的模型。')
    expect(zhApiConfig.creativeEngine.serviceName).toBe('服务名称')
    expect(zhApiConfig.creativeEngine.modelPurposes.text).toBe('文本')
    expect(zhApiConfig.creativeEngine.modelPurposes['image-generation']).toBe('图片生成')
    expect(zhApiConfig.creativeEngine.modelPurposes['video-generation']).toBe('视频')
    expect(zhApiConfig.creativeEngine.smartRecognitionDisclosure).toContain('完整密钥')
    expect(zhApiConfig.creativeEngine.saveEngine).toBe('保存创作引擎')
    expect(zhApiConfig.creativeEngine.skipDetectionAndSave).toBe('跳过检测并保存')
    expect(zhApiConfig.creativeEngine.testModel).toBe('检测模型是否可用')
    expect(enApiConfig.creativeEngine.testingModel).toBe('Checking...')
  })

  it('does not contain forbidden automatic-decision copy', () => {
    const serialized = JSON.stringify(zhApiConfig)
    for (const phrase of forbiddenZh) {
      expect(serialized.includes(phrase)).toBe(false)
    }
  })
})
