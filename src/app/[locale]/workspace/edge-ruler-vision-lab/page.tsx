'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import { useUserModels } from '@/lib/query/hooks'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import { DEFAULT_EDGE_RULER_VISION_PROMPT } from '@/lib/edit-script/storyboard-consistency/edge-ruler-vision-prompt'
import { buildGridOverlayPreviewSvg } from '@/lib/edit-script/storyboard-consistency/grid-overlay-preview'

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

interface VisionResult {
  readonly model: string
  readonly rawText: string
  readonly parsedJson: unknown
  readonly usage?: {
    readonly promptTokens: number
    readonly completionTokens: number
    readonly totalTokens: number
  }
}

function dataUrlFromSvg(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('EDGE_RULER_IMAGE_LOAD_FAILED'))
    image.src = source
  })
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const sourceRatio = image.naturalWidth / image.naturalHeight
  const targetRatio = width / height
  const sourceWidth = sourceRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth
  const sourceHeight = sourceRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio
  const sourceX = (image.naturalWidth - sourceWidth) / 2
  const sourceY = (image.naturalHeight - sourceHeight) / 2
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
}

async function composeEdgeRulerImage(input: {
  readonly baseImageDataUrl: string
  readonly columns: number
  readonly rows: number
}): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('EDGE_RULER_CANVAS_CONTEXT_MISSING')

  const [baseImage, overlayImage] = await Promise.all([
    loadImage(input.baseImageDataUrl),
    loadImage(dataUrlFromSvg(buildGridOverlayPreviewSvg({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      columns: input.columns,
      rows: input.rows,
      variant: 'axis_ruler',
    }))),
  ])

  drawCoverImage(context, baseImage, CANVAS_WIDTH, CANVAS_HEIGHT)
  context.drawImage(overlayImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  return canvas.toDataURL('image/png')
}

function readUploadedFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('EDGE_RULER_UPLOAD_READ_FAILED'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('EDGE_RULER_UPLOAD_READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

function previewStyle(imageDataUrl: string | null): CSSProperties {
  if (!imageDataUrl) return { background: '#0f172a' }
  return {
    backgroundImage: `url("${imageDataUrl}")`,
    backgroundSize: 'contain',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

export default function EdgeRulerVisionLabPage() {
  const t = useTranslations('projectWorkflow.edgeRulerVisionLab')
  const userModels = useUserModels()
  const modelOptions = useMemo(() => userModels.data?.llm ?? [], [userModels.data?.llm])
  const [model, setModel] = useState('')
  const [columns, setColumns] = useState(16)
  const [rows, setRows] = useState(9)
  const [prompt, setPrompt] = useState(DEFAULT_EDGE_RULER_VISION_PROMPT)
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | null>(null)
  const [composedImageDataUrl, setComposedImageDataUrl] = useState<string | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [result, setResult] = useState<VisionResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!model && modelOptions[0]?.value) setModel(modelOptions[0].value)
  }, [model, modelOptions])

  useEffect(() => {
    let cancelled = false
    if (!uploadedImageDataUrl) {
      setComposedImageDataUrl(null)
      setComposeError(null)
      return
    }
    setComposeError(null)
    void composeEdgeRulerImage({ baseImageDataUrl: uploadedImageDataUrl, columns, rows })
      .then((imageDataUrl) => {
        if (!cancelled) setComposedImageDataUrl(imageDataUrl)
      })
      .catch((composeFailure: unknown) => {
        if (!cancelled) {
          setComposedImageDataUrl(null)
          setComposeError(composeFailure instanceof Error ? composeFailure.message : 'EDGE_RULER_COMPOSE_FAILED')
        }
      })
    return () => {
      cancelled = true
    }
  }, [columns, rows, uploadedImageDataUrl])

  const parsedJsonPreview = useMemo(() => {
    if (!result?.parsedJson) return null
    return JSON.stringify(result.parsedJson, null, 2)
  }, [result?.parsedJson])

  const handleUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setResult(null)
    setError(null)
    void readUploadedFile(file).then(setUploadedImageDataUrl).catch((uploadFailure: unknown) => {
      setUploadedImageDataUrl(null)
      setComposedImageDataUrl(null)
      setError(uploadFailure instanceof Error ? uploadFailure.message : 'EDGE_RULER_UPLOAD_FAILED')
    })
  }, [])

  const handleRun = useCallback(async () => {
    if (!model || !composedImageDataUrl) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const response = await apiFetch('/api/user/edge-ruler-vision-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          imageDataUrl: composedImageDataUrl,
          prompt,
          columns,
          rows,
          temperature: 0.1,
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, t('errors.requestFailed')))
      }
      setResult(await response.json() as VisionResult)
    } catch (runFailure: unknown) {
      setError(runFailure instanceof Error ? runFailure.message : t('errors.requestFailed'))
    } finally {
      setRunning(false)
    }
  }, [columns, composedImageDataUrl, model, prompt, rows, t])

  const canRun = Boolean(model && composedImageDataUrl && !running)

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">{t('eyebrow')}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{t('description')}</p>
          </div>
          <button
            type="button"
            className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canRun}
            onClick={() => void handleRun()}
          >
            {running ? t('running') : t('run')}
          </button>
        </header>

        <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/8 p-5">
              <h2 className="text-lg font-semibold">{t('setupTitle')}</h2>
              <div className="mt-4 grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase text-slate-400">{t('model')}</span>
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white"
                  >
                    {modelOptions.length === 0 ? (
                      <option value="">{userModels.isLoading ? t('loadingModels') : t('noModels')}</option>
                    ) : null}
                    {modelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.providerName ? `${option.providerName} · ${option.label}` : option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase text-slate-400">{t('columns')}</span>
                    <input
                      type="number"
                      min={4}
                      max={32}
                      value={columns}
                      onChange={(event) => setColumns(Math.max(4, Math.min(32, Number(event.target.value) || 16)))}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase text-slate-400">{t('rows')}</span>
                    <input
                      type="number"
                      min={4}
                      max={24}
                      value={rows}
                      onChange={(event) => setRows(Math.max(4, Math.min(24, Number(event.target.value) || 9)))}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white"
                    />
                  </label>
                </div>
                <label className="block rounded-2xl border border-dashed border-white/20 bg-white/5 p-4">
                  <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <AppIcon name="image" className="h-4 w-4" />
                    {t('upload')}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/8 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{t('promptTitle')}</h2>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                  onClick={() => setPrompt(DEFAULT_EDGE_RULER_VISION_PROMPT)}
                >
                  {t('resetPrompt')}
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="mt-4 h-[420px] w-full resize-y rounded-2xl border border-white/10 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
              />
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/8 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t('previewTitle')}</h2>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                  {columns} x {rows}
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
                <div className="aspect-video" style={previewStyle(composedImageDataUrl)} />
              </div>
              {composeError ? (
                <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{composeError}</p>
              ) : null}
              {!uploadedImageDataUrl ? (
                <p className="mt-3 text-sm text-slate-400">{t('uploadHint')}</p>
              ) : null}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/8 p-5">
              <h2 className="text-lg font-semibold">{t('resultTitle')}</h2>
              {error ? (
                <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>
              ) : null}
              {result?.usage ? (
                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-slate-300">
                  <div className="rounded-2xl bg-white/8 px-3 py-2">{t('usage.prompt', { count: result.usage.promptTokens })}</div>
                  <div className="rounded-2xl bg-white/8 px-3 py-2">{t('usage.completion', { count: result.usage.completionTokens })}</div>
                  <div className="rounded-2xl bg-white/8 px-3 py-2">{t('usage.total', { count: result.usage.totalTokens })}</div>
                </div>
              ) : null}
              {parsedJsonPreview ? (
                <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-cyan-50">{parsedJsonPreview}</pre>
              ) : result?.rawText ? (
                <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-cyan-50">{result.rawText}</pre>
              ) : (
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">{t('emptyResult')}</p>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
