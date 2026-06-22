import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { VideoComposition } from '@/features/video-editor/remotion/VideoComposition'

vi.mock('remotion', () => ({
  AbsoluteFill: ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={style}>{children}</div>
  ),
  Sequence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Video: ({ src, style }: { src: string; style?: React.CSSProperties }) => <video src={src} style={style} />,
  Img: ({ src, style }: { src: string; style?: React.CSSProperties }) => React.createElement('img', { src, style, alt: '' }),
  Audio: ({ src }: { src: string }) => <audio src={src} />,
  useCurrentFrame: () => 0,
  interpolate: () => 1,
}))

const config = {
  fps: 30,
  width: 1920,
  height: 1080,
  videoRatio: '16:9',
  burnSubtitlesDefault: true,
}

describe('VideoComposition subtitle placement', () => {
  it('renders lower subtitles with the lower padding', () => {
    const html = renderToStaticMarkup(
      <VideoComposition
        clips={[]}
        audioTrack={[]}
        subtitleCues={[{
          id: 'sub-1',
          text: 'Lower subtitle',
          startFrame: 0,
          endFrame: 30,
          style: 'default',
          placement: 'lower',
        }]}
        bgmTrack={[]}
        config={config}
        burnSubtitles
      />
    )

    expect(html).toContain('Lower subtitle')
    expect(html).toContain('padding-bottom:32px')
  })

  it('renders imported image clips as images', () => {
    const html = renderToStaticMarkup(
      <VideoComposition
        clips={[{
          id: 'clip-image',
          kind: 'source',
          src: '/m/import.png',
          durationInFrames: 30,
          metadata: {
            storyboardId: 'storyboard-1',
            source: 'imported',
            mediaSourceType: 'user_import_image',
          },
        }]}
        audioTrack={[]}
        subtitleCues={[]}
        bgmTrack={[]}
        config={config}
        burnSubtitles
      />
    )

    expect(html).toContain('<img')
    expect(html).toContain('/m/import.png')
    expect(html).not.toContain('<video')
  })
})
