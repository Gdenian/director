import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { VideoComposition } from './VideoComposition'
import type { AudioAttachment, BgmClip, EditorConfig, SubtitleCue, VideoClip } from '../types/editor.types'

export type EditorRenderInputProps = {
  clips: VideoClip[]
  audioTrack: AudioAttachment[]
  subtitleCues: SubtitleCue[]
  bgmTrack: BgmClip[]
  config: EditorConfig
  burnSubtitles: boolean
  durationInFrames: number
}

function RemotionRoot() {
  const component = VideoComposition as unknown as React.FC<Record<string, unknown>>
  return (
    <Composition
      id="EditorVideo"
      component={component}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        clips: [],
        audioTrack: [],
        subtitleCues: [],
        bgmTrack: [],
        config: {
          fps: 30,
          width: 1920,
          height: 1080,
          videoRatio: '16:9',
          burnSubtitlesDefault: true,
        },
        burnSubtitles: true,
        durationInFrames: 300,
      } satisfies EditorRenderInputProps}
      calculateMetadata={({ props }) => {
        const input = props as EditorRenderInputProps
        return {
          durationInFrames: Math.max(1, input.durationInFrames),
          fps: input.config.fps,
          width: input.config.width,
          height: input.config.height,
        }
      }}
    />
  )
}

registerRoot(RemotionRoot)
