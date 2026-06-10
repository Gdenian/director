'use client'

import { useMemo } from 'react'
import { VideoEditorStage, createProjectFromPanels } from '@/features/video-editor'
import { useMatchedVoiceLines } from '@/lib/query/hooks'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'

export default function EditorStageRoute() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId } = useWorkspaceProvider()
  const { storyboards } = useWorkspaceEpisodeStageData()
  const matchedVoiceLinesQuery = useMatchedVoiceLines(projectId, episodeId || null)

  const editorProject = useMemo(() => {
    if (!episodeId) return undefined

    const panels = storyboards.flatMap((storyboard) =>
      (storyboard.panels || []).map((panel) => ({
        id: panel.id,
        panelIndex: panel.panelIndex,
        storyboardId: storyboard.id,
        videoUrl: panel.lipSyncVideoUrl || panel.videoUrl || undefined,
        description: panel.description || undefined,
        duration: panel.duration || undefined,
      })),
    )

    return createProjectFromPanels(
      episodeId,
      panels,
      matchedVoiceLinesQuery.data?.voiceLines,
    )
  }, [episodeId, matchedVoiceLinesQuery.data?.voiceLines, storyboards])

  if (!episodeId || !editorProject) return null

  return (
    <VideoEditorStage
      projectId={projectId}
      episodeId={episodeId}
      initialProject={editorProject}
      onBack={() => runtime.onStageChange('videos')}
      exportEnabled={false}
    />
  )
}
