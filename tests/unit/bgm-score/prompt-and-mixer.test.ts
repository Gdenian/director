import { describe, expect, it } from 'vitest'
import { buildBgmScorePlanPrompt, buildFinalBgmMusicPrompt } from '@/lib/bgm-score/prompt'

describe('bgm score prompt builder', () => {
  it('builds a plan prompt with timeline context and dynamic single-track guidance', () => {
    const prompt = buildBgmScorePlanPrompt({
      editScript: {
        id: 'edit-1',
        userPrompt: 'A suspense scene.',
        title: 'Suspense',
        logline: 'A character finds a clue.',
        durationSec: 12,
        shots: [{
          shotNumber: 1,
          durationSec: 12,
          visualAction: 'The detective enters the room.',
          charactersAndScene: 'Detective in a dark room',
          camera: 'Slow dolly',
          videoPrompt: 'Dark room investigation',
          sound: 'room tone and footsteps only, no BGM',
        }],
        videoBlocks: [{
          kind: 'single',
          shotNumbers: [1],
          reason: 'Single suspense shot.',
          prompt: 'Dark room investigation video.',
        }],
      },
      projectContext: { videoRatio: '16:9' },
      totalDurationSeconds: 12,
      clips: [{
        panelId: 'panel-1',
        groupId: null,
        sourceKind: 'panel',
        source: '/m/video.mp4',
        durationSeconds: 12,
        order: 1,
        shotNumber: 1,
        shotNumbers: [1],
        description: 'The detective enters the room.',
        sound: 'room tone and footsteps only, no BGM',
      }],
    })

    expect(prompt).toContain('one single complete instrumental BGM track')
    expect(prompt).toContain('These concepts are guidance, not a fixed template')
    expect(prompt).toContain('scoreDesign.sections must be dynamic')
    expect(prompt).toContain('virtualLayers are text-only')
    expect(prompt).toContain('finalPrompt must be a self-contained prompt')
    expect(prompt).toContain('Final rendered media timeline JSON')
    expect(prompt).toContain('The detective enters the room')
    expect(prompt).not.toContain('Allowed stem roles')
    expect(prompt).not.toContain('isolated stem only')
  })

  it('condenses the score plan into one final provider prompt with design notes', () => {
    const providerPrompt = buildFinalBgmMusicPrompt({
      durationSeconds: 12,
      creativeBrief: {
        cueType: 'continuous instrumental underscore',
        genre: 'sci-fi drama',
        mood: 'awe and dread',
        narrativeFunction: 'connect the edit while leaving space for native video sound',
      },
      scoreDesign: {
        overview: 'A single cue with cold opening pressure and a warm reveal.',
        sections: [{
          category: 'Hit Point',
          title: 'planet reveal',
          purpose: 'Support awe without literal impact sound.',
          startSec: 8,
          endSec: 12,
          content: 'Open harmony and brighter register at the reveal.',
        }],
      },
      virtualLayers: [{
        name: 'wide harmonic pad',
        purpose: 'Internal color inside the single final cue.',
        content: 'Slowly opens from dark to warm.',
      }],
      promptSections: [{
        title: 'Reveal cue',
        purpose: 'Prompt building block.',
        startSec: 8,
        endSec: 12,
        content: 'Gradual harmonic opening at the reveal.',
      }],
      finalPrompt: 'Generate one complete continuous instrumental cinematic BGM track for 12 seconds, sci-fi drama, cold pressure into warm reveal, restrained orchestration, leave space for native video sound.',
      negativePrompt: 'no vocals, no lyrics, no Foley',
    })

    expect(providerPrompt).toContain('Generate one complete continuous instrumental cinematic BGM track')
    expect(providerPrompt).toContain('Composer design notes')
    expect(providerPrompt).toContain('wide harmonic pad')
    expect(providerPrompt).toContain('Render exactly one coherent instrumental BGM track')
    expect(providerPrompt).toContain('Negative prompt: no vocals, no lyrics, no Foley')
  })
})
