'use client'

import { useCallback, useMemo, useState } from 'react'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useAnalyzeProjectAssets } from '@/lib/query/hooks'
import type { RunResult, RunStreamView } from '@/lib/query/hooks/run-stream/types'

interface UseWorkspaceExecutionParams {
  projectId: string
  episodeId?: string
  analysisModel?: string | null
  novelText: string
  t: (key: string) => string
  onRefresh: (options?: { scope?: string; mode?: string }) => Promise<void>
  onOpenAssetLibrary: (focusCharacterId?: string | null, refreshAssets?: boolean) => void
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || err.message === 'Failed to fetch'
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function buildDisabledRunStream(): RunStreamView {
  const run = async (): Promise<RunResult> => ({
    runId: '',
    status: 'failed',
    summary: null,
    payload: null,
    errorMessage: 'PROJECT_ASSISTANT_PLAN_REQUIRED',
  })

  return {
    runState: null,
    runId: '',
    status: 'idle',
    isRunning: false,
    isRecoveredRunning: false,
    isVisible: false,
    errorMessage: '',
    summary: null,
    payload: null,
    stages: [],
    orderedSteps: [],
    activeStepId: null,
    selectedStep: null,
    outputText: '',
    overallProgress: 0,
    activeMessage: '',
    run,
    retryStep: run,
    stop: () => undefined,
    reset: () => undefined,
    selectStep: () => undefined,
  }
}

export function useWorkspaceExecution({
  projectId,
  episodeId,
  analysisModel,
  novelText,
  t,
  onRefresh,
}: UseWorkspaceExecutionParams) {
  const analyzeProjectAssetsMutation = useAnalyzeProjectAssets(projectId)

  const [isSubmittingTTS] = useState(false)
  const [isAssetAnalysisRunning, setIsAssetAnalysisRunning] = useState(false)
  const [isConfirmingAssets] = useState(false)
  const [isTransitioning] = useState(false)
  const [transitionProgress] = useState({ message: '', step: '' })

  const disabledRunStream = useMemo(() => buildDisabledRunStream(), [])

  const handleGenerateTTS = useCallback(async () => {
    _ulogInfo('[ProjectWorkspace] TTS is disabled, skip generate request')
  }, [])

  const handleAnalyzeAssets = useCallback(async () => {
    if (!episodeId) return
    if (isAssetAnalysisRunning) {
      _ulogInfo('[WorkspaceExecution] asset analysis already running, skip duplicate trigger')
      return
    }

    try {
      setIsAssetAnalysisRunning(true)
      await analyzeProjectAssetsMutation.mutateAsync({ episodeId })
      await onRefresh({ scope: 'assets' })
    } catch (err: unknown) {
      if (isAbortError(err)) {
        _ulogInfo(t('execution.requestAborted'))
        return
      }
      alert(`${t('execution.analysisFailed')}: ${getErrorMessage(err)}`)
    } finally {
      setIsAssetAnalysisRunning(false)
    }
  }, [analyzeProjectAssetsMutation, episodeId, isAssetAnalysisRunning, onRefresh, t])

  const runAssistantPlannedCreation = useCallback(async () => {
    void analysisModel
    void novelText
    alert(t('execution.assistantPlanRequired'))
  }, [analysisModel, novelText, t])

  return {
    isSubmittingTTS,
    isAssetAnalysisRunning,
    isConfirmingAssets,
    isTransitioning,
    transitionProgress,
    storyToScriptStream: disabledRunStream,
    scriptToStoryboardStream: disabledRunStream,
    handleGenerateTTS,
    handleAnalyzeAssets,
    runStoryToScriptFlow: runAssistantPlannedCreation,
    runScriptToStoryboardFlow: runAssistantPlannedCreation,
    showCreatingToast: false,
  }
}
