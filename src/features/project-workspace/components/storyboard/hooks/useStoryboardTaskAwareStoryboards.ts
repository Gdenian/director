'use client'

import { useMemo } from 'react'
import { ProjectStoryboard } from '@/types/project'
import { useStoryboardTaskPresentation } from '@/lib/query/hooks/useTaskPresentation'
import {
  isTaskRuntimeRunningPhase,
  TASK_RUNTIME_TARGETS,
} from '@/lib/task/runtime-targets'

interface TaskTarget {
  key: string
  targetType: string
  targetId: string
  types?: readonly string[]
  resource: 'text' | 'image' | 'video'
  hasOutput: boolean
}

interface UseStoryboardTaskAwareStoryboardsProps {
  projectId: string
  initialStoryboards: ProjectStoryboard[]
}

function buildStoryboardTextTargets(storyboards: ProjectStoryboard[]): TaskTarget[] {
  const targets: TaskTarget[] = []

  for (const storyboard of storyboards) {
    const storyboardTarget = TASK_RUNTIME_TARGETS.projectStoryboardText(storyboard.id)
    if (storyboardTarget) targets.push({
      key: `storyboard:${storyboard.id}`,
      ...storyboardTarget,
      resource: 'text',
      hasOutput: !!(storyboard.panels || []).length,
    })
    if (storyboard.episodeId) {
      const episodeTarget = TASK_RUNTIME_TARGETS.projectEpisodeStoryboardText(storyboard.episodeId)
      if (episodeTarget) targets.push({
        key: `episode:${storyboard.episodeId}`,
        ...episodeTarget,
        resource: 'text',
        hasOutput: !!(storyboard.panels || []).length,
      })
    }
  }

  return targets
}

function buildPanelTargets(storyboards: ProjectStoryboard[], type: 'image' | 'video' | 'lip-sync'): TaskTarget[] {
  const targets: TaskTarget[] = []

  for (const storyboard of storyboards) {
    for (const panel of storyboard.panels || []) {
      if (type === 'image') {
        const panelTarget = TASK_RUNTIME_TARGETS.projectPanelImageOperations(panel.id)
        if (panelTarget) targets.push({
          key: `panel-image:${panel.id}`,
          ...panelTarget,
          resource: 'image',
          hasOutput: !!panel.imageUrl,
        })
      } else if (type === 'video') {
        const panelTarget = TASK_RUNTIME_TARGETS.projectPanelVideo(panel.id)
        if (panelTarget) targets.push({
          key: `panel-video:${panel.id}`,
          ...panelTarget,
          resource: 'video',
          hasOutput: !!panel.videoUrl,
        })
      } else {
        const panelTarget = TASK_RUNTIME_TARGETS.projectPanelLipSync(panel.id)
        if (panelTarget) targets.push({
          key: `panel-lip:${panel.id}`,
          ...panelTarget,
          resource: 'video',
          hasOutput: !!panel.lipSyncVideoUrl,
        })
      }
    }
  }

  return targets
}

export function useStoryboardTaskAwareStoryboards({
  projectId,
  initialStoryboards,
}: UseStoryboardTaskAwareStoryboardsProps) {
  const storyboardTextTargets = useMemo(
    () => buildStoryboardTextTargets(initialStoryboards),
    [initialStoryboards],
  )
  const panelImageTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'image'),
    [initialStoryboards],
  )
  const panelVideoTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'video'),
    [initialStoryboards],
  )
  const panelLipSyncTargets = useMemo(
    () => buildPanelTargets(initialStoryboards, 'lip-sync'),
    [initialStoryboards],
  )

  const storyboardTextStates = useStoryboardTaskPresentation(
    projectId,
    storyboardTextTargets,
    !!projectId && storyboardTextTargets.length > 0,
  )
  const panelImageStates = useStoryboardTaskPresentation(
    projectId,
    panelImageTargets,
    !!projectId && panelImageTargets.length > 0,
  )
  const panelVideoStates = useStoryboardTaskPresentation(
    projectId,
    panelVideoTargets,
    !!projectId && panelVideoTargets.length > 0,
  )
  const panelLipSyncStates = useStoryboardTaskPresentation(
    projectId,
    panelLipSyncTargets,
    !!projectId && panelLipSyncTargets.length > 0,
  )

  const taskAwareStoryboards = useMemo(() => {
    return initialStoryboards.map((storyboard) => ({
      ...storyboard,
      storyboardTaskRunning:
        isTaskRuntimeRunningPhase(storyboardTextStates.getTaskState(`storyboard:${storyboard.id}`)?.phase) ||
        isTaskRuntimeRunningPhase(storyboardTextStates.getTaskState(`episode:${storyboard.episodeId}`)?.phase),
      panels: (storyboard.panels || []).map((panel) => {
        const panelImageTaskState = panelImageStates.getTaskState(`panel-image:${panel.id}`)
        const panelImageRunning = isTaskRuntimeRunningPhase(panelImageTaskState?.phase)
        return {
          ...panel,
          imageTaskRunning: panelImageRunning,
          imageTaskIntent: panelImageTaskState?.intent,
          videoTaskRunning: isTaskRuntimeRunningPhase(panelVideoStates.getTaskState(`panel-video:${panel.id}`)?.phase),
          lipSyncTaskRunning: isTaskRuntimeRunningPhase(panelLipSyncStates.getTaskState(`panel-lip:${panel.id}`)?.phase),
        }
      }),
    }))
  }, [
    initialStoryboards,
    panelImageStates,
    panelLipSyncStates,
    panelVideoStates,
    storyboardTextStates,
  ])

  return {
    taskAwareStoryboards,
  }
}
