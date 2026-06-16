import { logInfo as _ulogInfo } from '@/lib/logging/core'
/**
 * 生成器统一入口（增强版）
 * 
 * 支持：
 * - 严格使用 model_key（provider::modelId）
 * - 用户自定义模型的动态路由（仅通过配置中心）
 * - 统一错误处理
 */

import { createAudioGenerator, createImageGenerator, createVideoGenerator } from './generators/factory'
import type { GenerateResult } from './generators/base'
import { getProviderConfig, getProviderKey, resolveModelSelection } from './api-config'
import {
    generateImageViaOpenAICompat,
    generateImageViaOpenAICompatTemplate,
    generateVideoViaOpenAICompat,
    generateVideoViaOpenAICompatTemplate,
    resolveModelGatewayRoute,
} from './model-gateway'
import {
    assertMediaContractCapability,
    resolveRequestedImageCapability,
    resolveRequestedVideoCapability,
} from './media-contract/runtime'
import { generateBailianAudio, generateBailianImage, generateBailianVideo } from './providers/bailian'
import { generateSiliconFlowAudio, generateSiliconFlowImage, generateSiliconFlowVideo } from './providers/siliconflow'
import type { MediaContract } from './media-contract/types'
import type { OpenAICompatMediaTemplate } from './openai-compat-media-template'

type MediaModelSnapshot = {
    modelKey: string
    mediaContract?: MediaContract
    compatMediaTemplate?: OpenAICompatMediaTemplate
}

type GenerateImageOptions = {
    referenceImages?: string[]
    aspectRatio?: string
    resolution?: string
    outputFormat?: string
    keepOriginalAspectRatio?: boolean
    size?: string
    mediaModelSnapshot?: MediaModelSnapshot
}

type GenerateVideoOptions = {
    prompt?: string
    duration?: number
    fps?: number
    resolution?: string
    aspectRatio?: string
    generateAudio?: boolean
    lastFrameImageUrl?: string
    mediaModelSnapshot?: MediaModelSnapshot
    [key: string]: string | number | boolean | MediaModelSnapshot | undefined
}

const OFFICIAL_ONLY_PROVIDER_KEYS = new Set(['bailian', 'siliconflow'])
const OFFICIAL_CONTRACT_EXECUTORS = new Set(['official-adapter', 'gemini-standard'])

function isTrustedOfficialAdapterProvider(providerKey: string): boolean {
    return providerKey === 'bailian' || providerKey === 'siliconflow'
}

function assertMediaContractExecutorProviderSupported(input: {
    executor: string
    providerKey: string
    providerConfig?: { apiMode?: string | null }
}): void {
    const { executor, providerKey, providerConfig } = input
    if (executor === 'openai-compat-template' && providerKey !== 'openai-compatible') {
        throw new Error('MEDIA_CONTRACT_EXECUTOR_PROVIDER_UNSUPPORTED: openai-compat-template')
    }
    if (executor === 'openai-standard' && providerKey !== 'openai-compatible') {
        throw new Error('MEDIA_CONTRACT_EXECUTOR_PROVIDER_UNSUPPORTED: openai-standard')
    }
    if (executor !== 'gemini-standard') {
        return
    }
    if (providerKey !== 'gemini-compatible' && providerKey !== 'google') {
        throw new Error('MEDIA_CONTRACT_EXECUTOR_PROVIDER_UNSUPPORTED: gemini-standard')
    }
    if (providerKey === 'gemini-compatible' && providerConfig?.apiMode === 'openai-official') {
        throw new Error('MEDIA_CONTRACT_EXECUTOR_PROVIDER_UNSUPPORTED: gemini-standard')
    }
}

/**
 * 将 aspectRatio 映射为 OpenAI 兼容的 size
 */
function aspectRatioToOpenAISize(aspectRatio: string | undefined): string | undefined {
    if (!aspectRatio) return undefined
    const ratio = aspectRatio.trim()
    // OpenAI 支持的尺寸: 1024x1024, 1792x1024, 1024x1792, 1536x1024, 1024x1536
    const mapping: Record<string, string> = {
        '1:1': '1024x1024',
        '16:9': '1792x1024',
        '9:16': '1024x1792',
        '3:2': '1536x1024',
        '2:3': '1024x1536',
    }
    return mapping[ratio] || undefined
}

function resolveMediaSnapshot(input: {
    selection: { modelKey: string; mediaContract?: MediaContract; compatMediaTemplate?: OpenAICompatMediaTemplate }
    snapshot?: MediaModelSnapshot
}) {
    const { selection, snapshot } = input
    if (snapshot?.modelKey === selection.modelKey) {
        return {
            mediaContract: snapshot.mediaContract,
            compatMediaTemplate: snapshot.compatMediaTemplate,
        }
    }
    return {
        mediaContract: selection.mediaContract,
        compatMediaTemplate: selection.compatMediaTemplate,
    }
}

/**
 * 生成图片（简化版）
 * 
 * @param userId 用户 ID
 * @param modelKey 模型唯一键（provider::modelId）
 * @param prompt 提示词
 * @param options 生成选项
 */
export async function generateImage(
    userId: string,
    modelKey: string,
    prompt: string,
    options?: GenerateImageOptions
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'image')
    _ulogInfo(`[generateImage] resolved model selection: ${selection.modelKey}`)
    const { mediaContract, compatMediaTemplate } = resolveMediaSnapshot({
        selection,
        snapshot: options?.mediaModelSnapshot,
    })
    const providerKey = getProviderKey(selection.provider).toLowerCase()
    let providerConfig: Awaited<ReturnType<typeof getProviderConfig>> | undefined
    const resolveProviderConfig = async () => {
        providerConfig = providerConfig || await getProviderConfig(userId, selection.provider)
        return providerConfig
    }
    const { referenceImages, ...generatorOptions } = options || {}
    delete generatorOptions.mediaModelSnapshot
    if (mediaContract) {
        const executorProviderConfig = mediaContract.executor === 'gemini-standard' && providerKey === 'gemini-compatible'
            ? await resolveProviderConfig()
            : undefined
        assertMediaContractCapability({
            contract: mediaContract,
            capability: resolveRequestedImageCapability(options?.referenceImages),
            trustedOfficialAdapter: isTrustedOfficialAdapterProvider(providerKey),
        })
        assertMediaContractExecutorProviderSupported({
            executor: mediaContract.executor,
            providerKey,
            providerConfig: executorProviderConfig,
        })
    }
    const shouldUseOfficialProvider = !mediaContract || OFFICIAL_CONTRACT_EXECUTORS.has(mediaContract.executor)
    if (shouldUseOfficialProvider && providerKey === 'bailian') {
        return await generateBailianImage({
            userId,
            prompt,
            referenceImages,
            options: {
                ...generatorOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    if (shouldUseOfficialProvider && providerKey === 'siliconflow') {
        return await generateSiliconFlowImage({
            userId,
            prompt,
            referenceImages,
            options: {
                ...generatorOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    providerConfig = await resolveProviderConfig()
    const defaultGatewayRoute = resolveModelGatewayRoute(selection.provider)
    let gatewayRoute = OFFICIAL_ONLY_PROVIDER_KEYS.has(providerKey)
        ? 'official'
        : (providerConfig.gatewayRoute || defaultGatewayRoute)
    if (providerKey === 'gemini-compatible') {
        // DEPRECATED: historical rows persisted gemini-compatible as openai-compat by default.
        // Runtime now resolves route by apiMode to avoid requiring data migration SQL.
        gatewayRoute = providerConfig.apiMode === 'openai-official' ? 'openai-compat' : 'official'
    }

    // 调用生成（提取 referenceImages 单独传递，其余选项合并进 options）
    if (mediaContract?.executor === 'openai-compat-template') {
        const compatTemplate = compatMediaTemplate
        if (!compatTemplate) {
            throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${selection.modelKey}`)
        }
        return await generateImageViaOpenAICompatTemplate({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
            prompt,
            referenceImages,
            options: {
                ...generatorOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: 'openai-compatible',
            template: compatTemplate,
            mediaContract,
        })
    }
    if (mediaContract?.executor === 'openai-standard') {
        let openaiCompatOptions = { ...generatorOptions }
        if (openaiCompatOptions.aspectRatio) {
            const mappedSize = aspectRatioToOpenAISize(openaiCompatOptions.aspectRatio)
            if (mappedSize && !openaiCompatOptions.size) {
                openaiCompatOptions = { ...openaiCompatOptions, size: mappedSize }
            }
            delete openaiCompatOptions.aspectRatio
        }

        return await generateImageViaOpenAICompat({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            prompt,
            referenceImages,
            options: {
                ...openaiCompatOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: 'openai-compatible',
        })
    }
    if (!mediaContract && gatewayRoute === 'openai-compat') {
        const compatTemplate = compatMediaTemplate
        if (providerKey === 'openai-compatible' && !compatTemplate) {
            throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${selection.modelKey}`)
        }
        if (compatTemplate) {
            return await generateImageViaOpenAICompatTemplate({
                userId,
                providerId: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
                prompt,
                referenceImages,
                options: {
                    ...generatorOptions,
                    provider: selection.provider,
                    modelId: selection.modelId,
                    modelKey: selection.modelKey,
                },
                profile: 'openai-compatible',
                template: compatTemplate,
            })
        }

        // OpenAI 兼容模式：将 aspectRatio 转换为 size
        let openaiCompatOptions = { ...generatorOptions }
        if (openaiCompatOptions.aspectRatio) {
            const mappedSize = aspectRatioToOpenAISize(openaiCompatOptions.aspectRatio)
            if (mappedSize && !openaiCompatOptions.size) {
                openaiCompatOptions = { ...openaiCompatOptions, size: mappedSize }
            }
            // 移除不支持的 aspectRatio
            delete openaiCompatOptions.aspectRatio
        }

        return await generateImageViaOpenAICompat({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            prompt,
            referenceImages,
            options: {
                ...openaiCompatOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: 'openai-compatible',
        })
    }

    const generator = createImageGenerator(selection.provider, selection.modelId)
    return await generator.generate({
        userId,
        prompt,
        referenceImages,
        options: {
            ...generatorOptions,
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        }
    })
}

/**
 * 生成视频（增强版）
 * 
 * @param userId 用户 ID
 * @param modelKey 模型唯一键（provider::modelId）
 * @param imageUrl 输入图片 URL
 * @param options 生成选项
 */
export async function generateVideo(
    userId: string,
    modelKey: string,
    imageUrl: string,
    options?: GenerateVideoOptions
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'video')
    _ulogInfo(`[generateVideo] resolved model selection: ${selection.modelKey}`)
    const { mediaContract, compatMediaTemplate } = resolveMediaSnapshot({
        selection,
        snapshot: options?.mediaModelSnapshot,
    })
    const providerKey = getProviderKey(selection.provider).toLowerCase()
    let providerConfig: Awaited<ReturnType<typeof getProviderConfig>> | undefined
    const resolveProviderConfig = async () => {
        providerConfig = providerConfig || await getProviderConfig(userId, selection.provider)
        return providerConfig
    }
    const { prompt, ...providerOptions } = options || {}
    delete providerOptions.mediaModelSnapshot
    if (mediaContract) {
        const executorProviderConfig = mediaContract.executor === 'gemini-standard' && providerKey === 'gemini-compatible'
            ? await resolveProviderConfig()
            : undefined
        assertMediaContractCapability({
            contract: mediaContract,
            capability: resolveRequestedVideoCapability(options),
            trustedOfficialAdapter: isTrustedOfficialAdapterProvider(providerKey),
        })
        assertMediaContractExecutorProviderSupported({
            executor: mediaContract.executor,
            providerKey,
            providerConfig: executorProviderConfig,
        })
    }
    const shouldUseOfficialProvider = !mediaContract || OFFICIAL_CONTRACT_EXECUTORS.has(mediaContract.executor)
    if (shouldUseOfficialProvider && providerKey === 'bailian') {
        return await generateBailianVideo({
            userId,
            imageUrl,
            prompt,
            options: {
                ...providerOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    if (shouldUseOfficialProvider && providerKey === 'siliconflow') {
        return await generateSiliconFlowVideo({
            userId,
            imageUrl,
            prompt,
            options: {
                ...providerOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    providerConfig = await resolveProviderConfig()
    const defaultGatewayRoute = resolveModelGatewayRoute(selection.provider)
    const gatewayRoute = OFFICIAL_ONLY_PROVIDER_KEYS.has(providerKey)
        ? 'official'
        : (providerConfig.gatewayRoute || defaultGatewayRoute)

    if (mediaContract?.executor === 'openai-compat-template') {
        const compatTemplate = compatMediaTemplate
        if (!compatTemplate) {
            throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${selection.modelKey}`)
        }
        return await generateVideoViaOpenAICompatTemplate({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
            imageUrl,
            prompt: prompt || '',
            options: {
                ...providerOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: 'openai-compatible',
            template: compatTemplate,
            mediaContract,
        })
    }
    if (mediaContract?.executor === 'openai-standard') {
        return await generateVideoViaOpenAICompat({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
            imageUrl,
            prompt: prompt || '',
            options: {
                ...providerOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: 'openai-compatible',
        })
    }
    if (!mediaContract && gatewayRoute === 'openai-compat') {
        const compatTemplate = compatMediaTemplate
        if (providerKey === 'openai-compatible' && !compatTemplate) {
            throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${selection.modelKey}`)
        }
        if (compatTemplate) {
            return await generateVideoViaOpenAICompatTemplate({
                userId,
                providerId: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
                imageUrl,
                prompt: prompt || '',
                options: {
                    ...providerOptions,
                    provider: selection.provider,
                    modelId: selection.modelId,
                    modelKey: selection.modelKey,
                },
                profile: 'openai-compatible',
                template: compatTemplate,
            })
        }

        return await generateVideoViaOpenAICompat({
            userId,
            providerId: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
            imageUrl,
            prompt: prompt || '',
            options: {
                ...providerOptions,
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
            profile: 'openai-compatible',
        })
    }

    const generator = createVideoGenerator(selection.provider)
    return await generator.generate({
        userId,
        imageUrl,
        prompt,
        options: {
            ...providerOptions,
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        }
    })
}

/**
 * 生成语音
 */
export async function generateAudio(
    userId: string,
    modelKey: string,
    text: string,
    options?: {
        voice?: string
        rate?: number
    }
): Promise<GenerateResult> {
    const selection = await resolveModelSelection(userId, modelKey, 'audio')
    const providerKey = getProviderKey(selection.provider).toLowerCase()
    if (providerKey === 'bailian') {
        return await generateBailianAudio({
            userId,
            text,
            voice: options?.voice,
            rate: options?.rate,
            options: {
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    if (providerKey === 'siliconflow') {
        return await generateSiliconFlowAudio({
            userId,
            text,
            voice: options?.voice,
            rate: options?.rate,
            options: {
                provider: selection.provider,
                modelId: selection.modelId,
                modelKey: selection.modelKey,
            },
        })
    }
    const generator = createAudioGenerator(selection.provider)

    return generator.generate({
        userId,
        text,
        voice: options?.voice,
        rate: options?.rate,
        options: {
            provider: selection.provider,
            modelId: selection.modelId,
            modelKey: selection.modelKey,
        },
    })
}
