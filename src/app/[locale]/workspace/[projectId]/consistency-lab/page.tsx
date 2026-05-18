'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import { useProjectEditScript } from '@/lib/query/hooks'
import { useRouter } from '@/i18n/navigation'
import type {
  ConsistencyLabArtifactDto,
  ConsistencyLabRunDto,
  ConsistencyLabRunStage,
  ConsistencyLabRunStatus,
  ConsistencyLabStrategy,
} from '@/lib/consistency-lab/types'

const STRATEGIES: readonly ConsistencyLabStrategy[] = [
  'structured_text',
  'grid_coordinates',
  'contact_sheet_9grid',
] as const

interface RunsResponse {
  readonly runs: readonly ConsistencyLabRunDto[]
}

interface RunResponse {
  readonly run: ConsistencyLabRunDto
}

interface TaskSubmitResponse {
  readonly taskId?: string
  readonly deduped?: boolean
}

function latestRunForStrategy(runs: readonly ConsistencyLabRunDto[], strategy: ConsistencyLabStrategy) {
  return runs.find((run) => run.strategy === strategy) ?? null
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function readSourceVideoRatio(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const project = (value as { readonly project?: unknown }).project
  if (typeof project !== 'object' || project === null || Array.isArray(project)) return null
  const videoRatio = (project as { readonly videoRatio?: unknown }).videoRatio
  return typeof videoRatio === 'string' && videoRatio.trim() ? videoRatio : null
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(value: unknown): boolean {
  return value === true
}

function JsonBlock({ value }: { readonly value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
      {stringifyJson(value)}
    </pre>
  )
}

function PromptList({ run }: { readonly run: ConsistencyLabRunDto }) {
  if (run.panels.length === 0) return null
  return (
    <div className="space-y-2">
      {run.panels.map((panel) => (
        <details key={panel.id} className="rounded-md border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
            #{panel.sourceShotNumber}
          </summary>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-slate-100 px-3 py-2 text-[11px] leading-5 text-slate-600">
            {panel.prompt}
          </pre>
        </details>
      ))}
    </div>
  )
}

interface GridAnalysisCoordinate {
  readonly name: string
  readonly kind: string
  readonly x: number | null
  readonly y: number | null
  readonly facing: string
}

interface GridAnalysisBlock {
  readonly sourceVideoBlockId: string
  readonly classification: string
  readonly skipped: boolean
  readonly reason: string
  readonly cinematicTranslation: string
  readonly coordinates: readonly GridAnalysisCoordinate[]
}

function readGridAnalysisBlocks(value: unknown): readonly GridAnalysisBlock[] {
  const output = readObject(value)
  const blocks = Array.isArray(output?.blocks) ? output.blocks : []
  return blocks.flatMap((item): GridAnalysisBlock[] => {
    const block = readObject(item)
    if (!block) return []
    const coordinates = Array.isArray(block.coordinates) ? block.coordinates : []
    return [{
      sourceVideoBlockId: readString(block.sourceVideoBlockId),
      classification: readString(block.classification),
      skipped: readBoolean(block.skipped),
      reason: readString(block.reason),
      cinematicTranslation: readString(block.cinematicTranslation),
      coordinates: coordinates.flatMap((coordinate): GridAnalysisCoordinate[] => {
        const parsed = readObject(coordinate)
        if (!parsed) return []
        return [{
          name: readString(parsed.name),
          kind: readString(parsed.kind),
          x: readNumber(parsed.x),
          y: readNumber(parsed.y),
          facing: readString(parsed.facing),
        }]
      }),
    }]
  })
}

function GridAnalysisResult(props: {
  readonly run: ConsistencyLabRunDto
  readonly emptyLabel: string
  readonly skippedLabel: string
  readonly coordinatesLabel: string
  readonly translationLabel: string
  readonly reasonLabel: string
}) {
  const blocks = readGridAnalysisBlocks(props.run.strategyOutputJson)
  if (blocks.length === 0) return <p className="text-xs text-slate-500">{props.emptyLabel}</p>
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => (
        <div key={`${block.sourceVideoBlockId || 'block'}:${index}`} className="rounded-md border border-indigo-100 bg-indigo-50/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold text-slate-700">
              {block.sourceVideoBlockId || `videoBlock:${index + 1}`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                {block.classification || '-'}
              </span>
              {block.skipped ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  {props.skippedLabel}
                </span>
              ) : null}
            </div>
          </div>
          {block.reason ? (
            <p className="mt-2 text-xs leading-5 text-slate-600">
              <span className="font-semibold text-slate-700">{props.reasonLabel}: </span>{block.reason}
            </p>
          ) : null}
          {block.cinematicTranslation ? (
            <p className="mt-2 text-xs leading-5 text-slate-700">
              <span className="font-semibold">{props.translationLabel}: </span>{block.cinematicTranslation}
            </p>
          ) : null}
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{props.coordinatesLabel}</p>
            {block.coordinates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {block.coordinates.map((coordinate, coordinateIndex) => (
                  <span
                    key={`${coordinate.name || 'coordinate'}:${coordinateIndex}`}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700"
                  >
                    {coordinate.name || '-'} · {coordinate.kind || '-'} · [{coordinate.x ?? '-'}, {coordinate.y ?? '-'}]
                    {coordinate.facing ? ` · ${coordinate.facing}` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">{props.emptyLabel}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function artifactsByKind(run: ConsistencyLabRunDto, kind: ConsistencyLabArtifactDto['kind']) {
  return run.artifacts.filter((artifact) => artifact.kind === kind)
}

function ArtifactList(props: {
  readonly artifacts: readonly ConsistencyLabArtifactDto[]
  readonly title: string
  readonly emptyLabel: string
}) {
  if (props.artifacts.length === 0) return <p className="text-xs text-slate-500">{props.emptyLabel}</p>
  return (
    <div className="space-y-2">
      {props.artifacts.map((artifact) => (
        <details key={artifact.id} className="rounded-md border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
            {props.title} {artifact.groupIndex !== null ? `#${artifact.groupIndex + 1}` : ''} · {artifact.status}
          </summary>
          <div className="space-y-2 border-t border-slate-100 p-3">
            {artifact.errorMessage ? <p className="text-xs text-red-600">{artifact.errorMessage}</p> : null}
            {artifact.prompt ? (
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] leading-5 text-slate-600">
                {artifact.prompt}
              </pre>
            ) : null}
            <JsonBlock value={artifact.metadataJson} />
          </div>
        </details>
      ))}
    </div>
  )
}

function ArtifactImages(props: {
  readonly artifacts: readonly ConsistencyLabArtifactDto[]
  readonly emptyLabel: string
}) {
  const images = props.artifacts.filter((artifact) => artifact.imageUrl)
  if (images.length === 0) return <p className="mt-1 text-xs text-slate-500">{props.emptyLabel}</p>
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {images.map((artifact) => (
        artifact.imageUrl ? (
          <figure key={artifact.id} className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <Image
              src={artifact.imageUrl}
              alt={artifact.kind}
              width={320}
              height={180}
              unoptimized
              className="aspect-video w-full object-cover"
            />
            <figcaption className="px-2 py-1 text-[11px] text-slate-500">
              {artifact.kind}{artifact.groupIndex !== null ? ` #${artifact.groupIndex + 1}` : ''}
            </figcaption>
          </figure>
        ) : null
      ))}
    </div>
  )
}

function PanelImages(props: {
  readonly run: ConsistencyLabRunDto
  readonly generatingLabel: string
  readonly emptyLabel: string
  readonly shotLabel: string
}) {
  const { run } = props
  const panelsWithImages = run.panels.filter((panel) => panel.imageUrl)
  if (panelsWithImages.length === 0) {
    return <p className="mt-1">{run.panels.some((panel) => panel.status === 'generating') ? props.generatingLabel : props.emptyLabel}</p>
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {panelsWithImages.map((panel) => (
        panel.imageUrl ? (
          <figure key={panel.id} className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <Image
              src={panel.imageUrl}
              alt={`${props.shotLabel} ${panel.sourceShotNumber}`}
              width={320}
              height={180}
              unoptimized
              className="aspect-video w-full object-cover"
            />
            <figcaption className="px-2 py-1 text-[11px] text-slate-500">#{panel.sourceShotNumber}</figcaption>
          </figure>
        ) : null
      ))}
    </div>
  )
}

function ExperimentVideos(props: {
  readonly run: ConsistencyLabRunDto
  readonly emptyLabel: string
}) {
  const { run } = props
  if (run.videos.length === 0) return <p className="mt-1">{props.emptyLabel}</p>
  return (
    <div className="mt-3 space-y-3">
      {run.videos.map((video) => (
        <div key={video.id} className="rounded-md border border-slate-200 bg-white p-2">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{Array.isArray(video.sourceShotNumbers) ? video.sourceShotNumbers.join(', ') : video.sourceVideoBlockId}</span>
            <span>{video.status}</span>
          </div>
          {video.videoUrl ? (
            <video src={video.videoUrl} className="aspect-video w-full rounded bg-black" controls />
          ) : null}
        </div>
      ))}
    </div>
  )
}

export default function ConsistencyLabPage() {
  const params = useParams<{ locale?: string; projectId?: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('projectWorkflow.consistencyLab')
  if (!params?.projectId) throw new Error('ConsistencyLabPage requires projectId')
  if (!searchParams) throw new Error('ConsistencyLabPage requires searchParams')

  const projectId = params.projectId
  const locale = params.locale
  const episodeId = searchParams.get('episode') ?? ''
  const editScriptId = searchParams.get('editScriptId') ?? ''
  const [runs, setRuns] = useState<readonly ConsistencyLabRunDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [adoptedRunId, setAdoptedRunId] = useState<string | null>(null)
  const editScriptQuery = useProjectEditScript(projectId, episodeId || null)
  const editScript = editScriptQuery.data

  const loadRuns = useCallback(async () => {
    if (!episodeId || !editScriptId) {
      setError(t('missingParams'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const search = new URLSearchParams({ episode: episodeId, editScriptId })
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs?${search.toString()}`)
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('loadFailed')))
      const payload = await response.json() as RunsResponse
      setRuns(payload.runs)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [editScriptId, episodeId, projectId, t])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  const sourceRun = runs[0] ?? null
  const modelConfigSnapshot = sourceRun?.modelConfigSnapshot ?? null
  const sourceSnapshot = sourceRun?.sourceSnapshotJson ?? null
  const sourceVideoRatio = readSourceVideoRatio(sourceSnapshot)

  const sourceStats = useMemo(() => ({
    shots: editScript?.shots.length ?? 0,
    videoBlocks: editScript?.videoBlocks.length ?? 0,
    assets: editScript?.requirements.length ?? 0,
  }), [editScript])

  const createRun = async (strategy: ConsistencyLabStrategy) => {
    setBusyKey(`create:${strategy}`)
    setError(null)
    setNotice(t('submittingTask'))
    try {
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ episodeId, editScriptId, strategy, meta: { locale } }),
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('createFailed')))
      const payload = await response.json() as RunResponse
      setRuns((previous) => [payload.run, ...previous])
      setNotice(t('runCreated'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setNotice(null)
    } finally {
      setBusyKey(null)
    }
  }

  const updateRunProgress = useCallback((runId: string, status: ConsistencyLabRunStatus, currentStage: ConsistencyLabRunStage) => {
    setRuns((previous) => previous.map((run) => (
      run.id === runId
        ? {
            ...run,
            status,
            currentStage,
            errorMessage: null,
          }
        : run
    )))
  }, [])

  const readTaskSubmitResponse = async (response: Response, fallbackMessage: string): Promise<TaskSubmitResponse> => {
    if (!response.ok) throw new Error(await readApiErrorMessage(response, fallbackMessage))
    return await response.json() as TaskSubmitResponse
  }

  const showSubmittedNotice = (payload: TaskSubmitResponse) => {
    const taskId = payload.taskId ?? '-'
    setNotice(payload.deduped ? t('taskAlreadyRunning', { taskId }) : t('taskSubmitted', { taskId }))
  }

  const generateImages = async (runId: string) => {
    setBusyKey(`images:${runId}`)
    setError(null)
    setNotice(t('submittingTask'))
    try {
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs/${runId}/images`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meta: { locale } }),
      })
      const payload = await readTaskSubmitResponse(response, t('imageFailed'))
      updateRunProgress(runId, 'generating', 'images_generating')
      showSubmittedNotice(payload)
      await loadRuns()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setNotice(null)
    } finally {
      setBusyKey(null)
    }
  }

  const generateFloorPlans = async (runId: string) => {
    setBusyKey(`floorPlans:${runId}`)
    setError(null)
    setNotice(t('submittingTask'))
    try {
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs/${runId}/floor-plans`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meta: { locale } }),
      })
      const payload = await readTaskSubmitResponse(response, t('floorPlanFailed'))
      updateRunProgress(runId, 'generating', 'floor_plans_generating')
      showSubmittedNotice(payload)
      await loadRuns()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setNotice(null)
    } finally {
      setBusyKey(null)
    }
  }

  const analyzeGrid = async (runId: string) => {
    setBusyKey(`gridAnalysis:${runId}`)
    setError(null)
    setNotice(t('submittingTask'))
    try {
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs/${runId}/grid-analysis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meta: { locale } }),
      })
      const payload = await readTaskSubmitResponse(response, t('gridAnalysisFailed'))
      updateRunProgress(runId, 'generating', 'grid_analyzing')
      showSubmittedNotice(payload)
      await loadRuns()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setNotice(null)
    } finally {
      setBusyKey(null)
    }
  }

  const generateVideos = async (runId: string) => {
    setBusyKey(`videos:${runId}`)
    setError(null)
    setNotice(t('submittingTask'))
    try {
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs/${runId}/videos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meta: { locale } }),
      })
      const payload = await readTaskSubmitResponse(response, t('videoFailed'))
      updateRunProgress(runId, 'generating', 'videos_generating')
      showSubmittedNotice(payload)
      await loadRuns()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setNotice(null)
    } finally {
      setBusyKey(null)
    }
  }

  const deleteRun = async (runId: string) => {
    setBusyKey(`delete:${runId}`)
    setError(null)
    try {
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs/${runId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('deleteFailed')))
      setRuns((previous) => previous.filter((run) => run.id !== runId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusyKey(null)
    }
  }

  const adoptRun = async (runId: string) => {
    setBusyKey(`adopt:${runId}`)
    setError(null)
    try {
      const response = await apiFetch(`/api/projects/${projectId}/consistency-lab/runs/${runId}/adopt`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('adoptFailed')))
      setAdoptedRunId(runId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusyKey(null)
    }
  }

  useEffect(() => {
    const hasGeneratingRun = runs.some((run) => (
      run.status === 'generating'
      || run.panels.some((panel) => panel.status === 'generating' || panel.status === 'pending')
      || run.artifacts.some((artifact) => artifact.status === 'generating' || artifact.status === 'pending')
      || run.videos.some((video) => video.status === 'generating' || video.status === 'pending')
    ))
    if (!hasGeneratingRun) return
    const timer = window.setInterval(() => {
      void loadRuns()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [loadRuns, runs])

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <Navbar />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-5 py-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
              onClick={() => {
                router.push({
                  pathname: `/workspace/${projectId}`,
                  query: episodeId ? { episode: episodeId } : {},
                })
              }}
            >
              <AppIcon name="chevronLeft" className="h-4 w-4" />
              {t('back')}
            </button>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">{t('title')}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => void loadRuns()}
          >
            <AppIcon name="refresh" className="h-4 w-4" />
            {loading ? t('loading') : t('refresh')}
          </button>
        </header>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}
        {notice ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">{notice}</div>
        ) : null}

        <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">{t('source')}</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-900">{editScript?.title ?? editScriptId}</p>
          </div>
          <div className="space-y-1 text-sm text-slate-600">
            <p>{t('editScriptId')}: <span className="font-mono text-xs">{editScriptId}</span></p>
            <p>{t('episode')}: <span className="font-mono text-xs">{episodeId}</span></p>
          </div>
          <div className="space-y-1 text-sm text-slate-600">
            <p>{t('shots')}: {sourceStats.shots}</p>
            <p>{t('videoBlocks')}: {sourceStats.videoBlocks}</p>
            <p>{t('assets')}: {sourceStats.assets}</p>
          </div>
          <div className="space-y-1 text-sm text-slate-600">
            <p>{t('videoRatio')}: {sourceVideoRatio ?? '-'}</p>
            <p>{t('modelConfig')}: {modelConfigSnapshot ? t('ready') : '-'}</p>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {STRATEGIES.map((strategy) => {
            const run = latestRunForStrategy(runs, strategy)
            const createBusy = busyKey === `create:${strategy}`
            const floorPlanArtifacts = run ? artifactsByKind(run, 'grid_floor_plan') : []
            const overlayArtifacts = run ? artifactsByKind(run, 'grid_coordinate_overlay') : []
            const contactSheetArtifacts = run ? artifactsByKind(run, 'contact_sheet_full') : []
            const structuredTextArtifacts = run ? artifactsByKind(run, 'structured_text_plan') : []
            const hasReadyOverlay = overlayArtifacts.some((artifact) => artifact.status === 'ready' && artifact.imageUrl)
            const canGenerateImages = !!run && run.panels.length > 0 && (
              run.strategy !== 'grid_coordinates'
              || run.currentStage === 'panel_prompts_ready'
              || run.currentStage === 'images_ready'
            )
            return (
              <article key={strategy} className="flex min-h-[720px] flex-col rounded-md border border-slate-200 bg-white">
                <header className="border-b border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">{t(`strategies.${strategy}.title`)}</h2>
                      <p className="mt-1 text-sm leading-5 text-slate-600">{t(`strategies.${strategy}.description`)}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {run ? run.status : t('notCreated')}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={createBusy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      onClick={() => void createRun(strategy)}
                    >
                      {createBusy ? <AppIcon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <AppIcon name="plus" className="h-3.5 w-3.5" />}
                      {run ? t('regenerate') : t('create')}
                    </button>
                    {run ? (
                      <>
                        <button
                          type="button"
                          disabled={busyKey === `delete:${run.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void deleteRun(run.id)}
                        >
                          <AppIcon name="trash" className="h-3.5 w-3.5" />
                          {busyKey === `delete:${run.id}` ? t('deleting') : t('delete')}
                        </button>
                        <button
                          type="button"
                          disabled={!canGenerateImages || busyKey === `images:${run.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void generateImages(run.id)}
                        >
                          <AppIcon name="image" className="h-3.5 w-3.5" />
                          {busyKey === `images:${run.id}` ? t('generatingImages') : t('generateImages')}
                        </button>
                        {run.strategy === 'grid_coordinates' ? (
                          <>
                            <button
                              type="button"
                              disabled={floorPlanArtifacts.length === 0 || busyKey === `floorPlans:${run.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => void generateFloorPlans(run.id)}
                            >
                              <AppIcon name="image" className="h-3.5 w-3.5" />
                              {busyKey === `floorPlans:${run.id}` ? t('generatingFloorPlans') : t('generateFloorPlans')}
                            </button>
                            <button
                              type="button"
                              disabled={!hasReadyOverlay || busyKey === `gridAnalysis:${run.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => void analyzeGrid(run.id)}
                            >
                              <AppIcon name="badgeCheck" className="h-3.5 w-3.5" />
                              {busyKey === `gridAnalysis:${run.id}` ? t('analyzingGrid') : t('analyzeGrid')}
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyKey === `videos:${run.id}` || run.panels.some((panel) => !panel.imageUrl)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void generateVideos(run.id)}
                        >
                          <AppIcon name="video" className="h-3.5 w-3.5" />
                          {busyKey === `videos:${run.id}` ? t('generatingVideos') : t('generateVideos')}
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `adopt:${run.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void adoptRun(run.id)}
                        >
                          <AppIcon name="badgeCheck" className="h-3.5 w-3.5" />
                          {adoptedRunId === run.id ? t('adopted') : busyKey === `adopt:${run.id}` ? t('adopting') : t('adopt')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </header>

                {run ? (
                  <div className="flex flex-1 flex-col gap-4 p-4">
                    <div className="text-xs text-slate-500">
                      {t('status')}: {run.status} · {t('stage')}: {run.currentStage} · {t('panels', { count: run.panels.length })}
                    </div>
                    {run.errorMessage ? (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{run.errorMessage}</div>
                    ) : null}
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase text-slate-500">{t('strategyInput')}</h3>
                      <JsonBlock value={run.strategyInputJson} />
                    </section>
                    {run.strategy === 'structured_text' ? (
                      <section className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase text-slate-500">{t('structuredTextPlan')}</h3>
                        <ArtifactList artifacts={structuredTextArtifacts} title={t('structuredTextPlan')} emptyLabel={t('emptyArtifacts')} />
                      </section>
                    ) : null}
                    {run.strategy === 'grid_coordinates' ? (
                      <>
                        <section className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase text-slate-500">{t('floorPlanArtifacts')}</h3>
                          <ArtifactList artifacts={floorPlanArtifacts} title={t('floorPlan')} emptyLabel={t('emptyArtifacts')} />
                          <ArtifactImages artifacts={floorPlanArtifacts} emptyLabel={t('emptyMedia')} />
                        </section>
                        <section className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase text-slate-500">{t('coordinateOverlays')}</h3>
                          <ArtifactList artifacts={overlayArtifacts} title={t('coordinateOverlay')} emptyLabel={t('emptyArtifacts')} />
                          <ArtifactImages artifacts={overlayArtifacts} emptyLabel={t('emptyMedia')} />
                        </section>
                        <section className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase text-slate-500">{t('gridAnalysisResult')}</h3>
                          <GridAnalysisResult
                            run={run}
                            emptyLabel={t('emptyGridAnalysis')}
                            skippedLabel={t('skipped')}
                            coordinatesLabel={t('coordinates')}
                            translationLabel={t('cinematicTranslation')}
                            reasonLabel={t('reason')}
                          />
                        </section>
                      </>
                    ) : null}
                    {run.strategy === 'contact_sheet_9grid' ? (
                      <section className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase text-slate-500">{t('contactSheetArtifacts')}</h3>
                        <ArtifactList artifacts={contactSheetArtifacts} title={t('contactSheet')} emptyLabel={t('emptyArtifacts')} />
                        <ArtifactImages artifacts={contactSheetArtifacts} emptyLabel={t('emptyMedia')} />
                      </section>
                    ) : null}
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase text-slate-500">{t('strategyOutput')}</h3>
                      <JsonBlock value={run.strategyOutputJson} />
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase text-slate-500">{t('panelPrompts')}</h3>
                      <PromptList run={run} />
                    </section>
                    <section className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                      <p className="font-semibold text-slate-700">{t('panelImages')}</p>
                      <PanelImages run={run} generatingLabel={t('generating')} emptyLabel={t('emptyMedia')} shotLabel={t('shot')} />
                    </section>
                    <section className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                      <p className="font-semibold text-slate-700">{t('videos')}</p>
                      <ExperimentVideos run={run} emptyLabel={t('emptyMedia')} />
                    </section>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">
                    {t('empty')}
                  </div>
                )}
              </article>
            )
          })}
        </section>
      </div>
    </main>
  )
}
