import {
  normalizeToBase64ForGeneration,
  normalizeToOriginalMediaUrl,
} from '@/lib/media/outbound-image'
import type {
  MediaCapability,
  MediaContract,
  MediaInputArrayFormat,
  MediaInputFormat,
} from './types'

export type PreparedMediaInputValues = {
  image?: string
  images?: string[]
  lastFrameImage?: string
}

export type MediaInputDiagnosticCode =
  | 'MEDIA_INPUT_PUBLIC_URL_REQUIRED'
  | 'MEDIA_INPUT_BASE64_CONVERSION_FAILED'
  | 'MEDIA_INPUT_MULTIPART_CONVERSION_FAILED'
  | 'MEDIA_INPUT_LAST_FRAME_REQUIRED'
  | 'MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT'

export type MediaInputDiagnostic = {
  code: MediaInputDiagnosticCode
  field: 'image' | 'images' | 'lastFrameImage'
  message: string
}

export type PrepareMediaInputsParams = {
  capability: MediaCapability
  contract: MediaContract
  image?: string
  images?: string[]
  lastFrameImage?: string
}

export type PrepareMediaInputsResult = {
  ok: boolean
  values: PreparedMediaInputValues
  diagnostics: MediaInputDiagnostic[]
}

type MediaInputField = MediaInputDiagnostic['field']

const INPUT_FORMATS = new Set<MediaInputFormat>([
  'publicUrl',
  'dataUrlBase64',
  'rawBase64',
  'multipartFile',
])

const INPUT_ARRAY_FORMATS = new Set<MediaInputArrayFormat>([
  'publicUrlArray',
  'dataUrlBase64Array',
  'rawBase64Array',
  'multipartFiles',
])

function diagnostic(
  code: MediaInputDiagnosticCode,
  field: MediaInputField,
  message: string,
): MediaInputDiagnostic {
  return { code, field, message }
}

function unsupportedFormatDiagnostic(field: MediaInputField, format: unknown): MediaInputDiagnostic {
  return diagnostic(
    'MEDIA_INPUT_FORMAT_UNSUPPORTED_BY_CONTRACT',
    field,
    `Media contract declares unsupported ${field} input format: ${String(format)}.`,
  )
}

function isMediaInputFormat(format: unknown): format is MediaInputFormat {
  return typeof format === 'string' && INPUT_FORMATS.has(format as MediaInputFormat)
}

function isMediaInputArrayFormat(format: unknown): format is MediaInputArrayFormat {
  return typeof format === 'string' && INPUT_ARRAY_FORMATS.has(format as MediaInputArrayFormat)
}

function missingInputDiagnostic(field: MediaInputField): MediaInputDiagnostic {
  const code = field === 'lastFrameImage'
    ? 'MEDIA_INPUT_LAST_FRAME_REQUIRED'
    : 'MEDIA_INPUT_PUBLIC_URL_REQUIRED'
  return diagnostic(
    code,
    field,
    `Media contract requires ${field} input.`,
  )
}

function requiresImageInput(
  capability: MediaCapability,
  contract: MediaContract,
): boolean {
  if (capability === 'image-to-video' || capability === 'first-last-frame-video') {
    return !!contract.input.image
  }
  if (capability === 'image-to-image' || capability === 'image-edit') {
    return !contract.input.images && !!contract.input.image
  }
  return false
}

function requiresImagesInput(
  capability: MediaCapability,
  contract: MediaContract,
): boolean {
  return (capability === 'image-to-image' || capability === 'image-edit') && !!contract.input.images
}

function requiresLastFrameInput(capability: MediaCapability): boolean {
  return capability === 'first-last-frame-video'
}

function rawBase64FromDataUrl(value: string): string {
  return value.replace(/^data:[^,]*;base64,/i, '')
}

function arrayFormatToInputFormat(format: MediaInputArrayFormat): MediaInputFormat {
  switch (format) {
    case 'publicUrlArray':
      return 'publicUrl'
    case 'dataUrlBase64Array':
      return 'dataUrlBase64'
    case 'rawBase64Array':
      return 'rawBase64'
    case 'multipartFiles':
      return 'multipartFile'
  }
}

function conversionFailureCode(format: MediaInputFormat): MediaInputDiagnosticCode {
  return format === 'multipartFile'
    ? 'MEDIA_INPUT_MULTIPART_CONVERSION_FAILED'
    : 'MEDIA_INPUT_BASE64_CONVERSION_FAILED'
}

async function convertInput(
  format: MediaInputFormat,
  input: string,
): Promise<string> {
  switch (format) {
    case 'publicUrl':
      return await normalizeToOriginalMediaUrl(input)
    case 'dataUrlBase64':
    case 'multipartFile':
      return await normalizeToBase64ForGeneration(input)
    case 'rawBase64':
      return rawBase64FromDataUrl(await normalizeToBase64ForGeneration(input))
  }
}

async function prepareSingleInput(
  format: MediaInputFormat,
  field: MediaInputField,
  input: string,
): Promise<{
  value?: string
  diagnostic?: MediaInputDiagnostic
}> {
  try {
    return { value: await convertInput(format, input) }
  } catch (error) {
    return {
      diagnostic: diagnostic(
        format === 'publicUrl' ? 'MEDIA_INPUT_PUBLIC_URL_REQUIRED' : conversionFailureCode(format),
        field,
        error instanceof Error ? error.message : String(error),
      ),
    }
  }
}

export async function prepareMediaInputs(
  params: PrepareMediaInputsParams,
): Promise<PrepareMediaInputsResult> {
  const values: PreparedMediaInputValues = {}
  const diagnostics: MediaInputDiagnostic[] = []
  const { capability, contract } = params
  const imageFormat = contract.input.image
  const imagesFormat = contract.input.images
  const lastFrameImageFormat = contract.input.lastFrameImage

  if (imageFormat && !isMediaInputFormat(imageFormat)) {
    diagnostics.push(unsupportedFormatDiagnostic('image', imageFormat))
  }
  if (imagesFormat && !isMediaInputArrayFormat(imagesFormat)) {
    diagnostics.push(unsupportedFormatDiagnostic('images', imagesFormat))
  }
  if (lastFrameImageFormat && !isMediaInputFormat(lastFrameImageFormat)) {
    diagnostics.push(unsupportedFormatDiagnostic('lastFrameImage', lastFrameImageFormat))
  }
  if (diagnostics.length > 0) {
    return { ok: false, values, diagnostics }
  }

  const imageRequired = requiresImageInput(capability, contract)
  const imagesRequired = requiresImagesInput(capability, contract)
  const lastFrameImageRequired = requiresLastFrameInput(capability)

  if ((capability === 'image-to-image' || capability === 'image-edit') && !imageFormat && !imagesFormat) {
    diagnostics.push(unsupportedFormatDiagnostic('image', undefined))
  }
  if ((capability === 'image-to-video' || capability === 'first-last-frame-video') && !imageFormat) {
    diagnostics.push(unsupportedFormatDiagnostic('image', undefined))
  }
  if (capability === 'first-last-frame-video' && !lastFrameImageFormat) {
    diagnostics.push(unsupportedFormatDiagnostic('lastFrameImage', undefined))
  }

  if (imageFormat && (params.image || imageRequired)) {
    if (!params.image) {
      diagnostics.push(missingInputDiagnostic('image'))
    } else {
      const result = await prepareSingleInput(imageFormat, 'image', params.image)
      if (result.diagnostic) diagnostics.push(result.diagnostic)
      if (result.value) values.image = result.value
    }
  }

  if (imagesFormat && ((params.images?.length ?? 0) > 0 || imagesRequired)) {
    if (!params.images?.length) {
      diagnostics.push(missingInputDiagnostic('images'))
    } else {
      const format = arrayFormatToInputFormat(imagesFormat)
      const converted: string[] = []
      for (const image of params.images) {
        const result = await prepareSingleInput(format, 'images', image)
        if (result.diagnostic) diagnostics.push(result.diagnostic)
        if (result.value) converted.push(result.value)
      }
      if (converted.length > 0) values.images = converted
    }
  }

  if (lastFrameImageFormat && (params.lastFrameImage || lastFrameImageRequired)) {
    if (!params.lastFrameImage) {
      diagnostics.push(missingInputDiagnostic('lastFrameImage'))
    } else {
      const result = await prepareSingleInput(
        lastFrameImageFormat,
        'lastFrameImage',
        params.lastFrameImage,
      )
      if (result.diagnostic) diagnostics.push(result.diagnostic)
      if (result.value) values.lastFrameImage = result.value
    }
  }

  return {
    ok: diagnostics.length === 0,
    values,
    diagnostics,
  }
}
