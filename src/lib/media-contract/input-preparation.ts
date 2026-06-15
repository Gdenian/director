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

function diagnostic(
  code: MediaInputDiagnosticCode,
  field: MediaInputField,
  message: string,
): MediaInputDiagnostic {
  return { code, field, message }
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
  const { contract } = params

  if (contract.input.image) {
    if (!params.image) {
      diagnostics.push(diagnostic(
        'MEDIA_INPUT_PUBLIC_URL_REQUIRED',
        'image',
        'Media contract requires an image input.',
      ))
    } else {
      const result = await prepareSingleInput(contract.input.image, 'image', params.image)
      if (result.diagnostic) diagnostics.push(result.diagnostic)
      if (result.value) values.image = result.value
    }
  }

  if (contract.input.images) {
    if (params.images?.length) {
      const format = arrayFormatToInputFormat(contract.input.images)
      const converted: string[] = []
      for (const image of params.images) {
        const result = await prepareSingleInput(format, 'images', image)
        if (result.diagnostic) diagnostics.push(result.diagnostic)
        if (result.value) converted.push(result.value)
      }
      if (converted.length > 0) values.images = converted
    }
  }

  if (contract.input.lastFrameImage) {
    if (!params.lastFrameImage) {
      diagnostics.push(diagnostic(
        'MEDIA_INPUT_LAST_FRAME_REQUIRED',
        'lastFrameImage',
        'Media contract requires a last frame image input.',
      ))
    } else {
      const result = await prepareSingleInput(
        contract.input.lastFrameImage,
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
