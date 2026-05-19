'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import {
  buildGridOverlayPreviewSvg,
  GRID_OVERLAY_PREVIEW_VARIANTS,
  type GridOverlayPreviewVariant,
} from '@/lib/edit-script/storyboard-consistency/grid-overlay-preview'

type BackgroundMode = 'white' | 'black' | 'gradient' | 'checker' | 'photo' | 'upload'

const BACKGROUND_MODES = ['white', 'black', 'gradient', 'checker', 'photo', 'upload'] as const satisfies readonly BackgroundMode[]
const PREVIEW_WIDTH = 1280
const PREVIEW_HEIGHT = 720

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function samplePhotoDataUrl(): string {
  const svg = [
    `<svg width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    '<linearGradient id="sky" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#28384a"/><stop offset="0.42" stop-color="#6b5b3d"/><stop offset="1" stop-color="#172112"/></linearGradient>',
    '<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="8"/><feColorMatrix type="saturate" values="0.35"/><feBlend mode="multiply" in2="SourceGraphic"/></filter>',
    '</defs>',
    '<rect width="100%" height="100%" fill="url(#sky)"/>',
    '<rect x="80" y="70" width="420" height="550" fill="#403525" opacity="0.78"/>',
    '<rect x="520" y="110" width="620" height="420" fill="#6f745d" opacity="0.55"/>',
    '<circle cx="950" cy="210" r="165" fill="#d6bd63" opacity="0.38"/>',
    '<path d="M0 620 C260 460 410 690 680 520 C820 430 1030 520 1280 390 L1280 720 L0 720 Z" fill="#29351f" opacity="0.88"/>',
    '<path d="M700 80 L760 700 M780 30 L900 720 M980 0 L1080 720" stroke="#1f2937" stroke-width="20" opacity="0.55"/>',
    '<rect width="100%" height="100%" filter="url(#grain)" opacity="0.42"/>',
    '</svg>',
  ].join('')
  return svgDataUrl(svg)
}

function backgroundStyle(mode: BackgroundMode, uploadedImageUrl: string | null): CSSProperties {
  if (mode === 'upload' && uploadedImageUrl) {
    return {
      backgroundImage: `url("${uploadedImageUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  if (mode === 'black') return { background: '#020617' }
  if (mode === 'gradient') {
    return {
      background: 'linear-gradient(135deg, #f8fafc 0%, #0f172a 46%, #facc15 67%, #111827 100%)',
    }
  }
  if (mode === 'checker') {
    return {
      backgroundColor: '#ffffff',
      backgroundImage: 'linear-gradient(45deg, #020617 25%, transparent 25%), linear-gradient(-45deg, #020617 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #020617 75%), linear-gradient(-45deg, transparent 75%, #020617 75%)',
      backgroundPosition: '0 0, 0 32px, 32px -32px, -32px 0px',
      backgroundSize: '64px 64px',
    }
  }
  if (mode === 'photo') {
    return {
      backgroundImage: `url("${samplePhotoDataUrl()}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return { background: '#ffffff' }
}

function readUploadedFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('GRID_OVERLAY_UPLOAD_READ_FAILED'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('GRID_OVERLAY_UPLOAD_READ_FAILED'))
    reader.readAsDataURL(file)
  })
}

export default function GridOverlayLabPage() {
  const t = useTranslations('projectWorkflow.gridOverlayLab')
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('photo')
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<GridOverlayPreviewVariant>('halo_dual_line')
  const [columns, setColumns] = useState(16)
  const [rows, setRows] = useState(9)

  const variantSvgs = useMemo(() => (
    GRID_OVERLAY_PREVIEW_VARIANTS.map((variant) => ({
      variant,
      svg: buildGridOverlayPreviewSvg({
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        columns,
        rows,
        variant,
      }),
    }))
  ), [columns, rows])

  const selectedSvg = variantSvgs.find((item) => item.variant === selectedVariant)?.svg ?? variantSvgs[0]?.svg ?? ''

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">{t('eyebrow')}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{t('description')}</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-100">
            {t('currentGrid', { columns, rows })}
          </div>
        </header>

        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/8 p-4 shadow-2xl shadow-black/30 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {BACKGROUND_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${backgroundMode === mode ? 'border-cyan-300 bg-cyan-300/16 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                onClick={() => setBackgroundMode(mode)}
              >
                {t(`backgrounds.${mode}`)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="block text-xs font-semibold uppercase text-slate-400">{t('columns')}</span>
              <input
                type="number"
                min={4}
                max={32}
                value={columns}
                onChange={(event) => setColumns(Math.max(4, Math.min(32, Number(event.target.value) || 16)))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="block text-xs font-semibold uppercase text-slate-400">{t('rows')}</span>
              <input
                type="number"
                min={4}
                max={24}
                value={rows}
                onChange={(event) => setRows(Math.max(4, Math.min(24, Number(event.target.value) || 9)))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="sm:col-span-2 rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-slate-300">
              <span className="mb-2 flex items-center gap-2 font-semibold text-white">
                <AppIcon name="image" className="h-4 w-4" />
                {t('upload')}
              </span>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  void readUploadedFile(file).then((imageUrl) => {
                    setUploadedImageUrl(imageUrl)
                    setBackgroundMode('upload')
                  })
                }}
              />
            </label>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
          {variantSvgs.map(({ variant, svg }) => (
            <article
              key={variant}
              className={`overflow-hidden rounded-3xl border bg-white shadow-2xl transition ${selectedVariant === variant ? 'border-cyan-300 ring-4 ring-cyan-300/30' : 'border-white/10'}`}
            >
              <div className="relative aspect-video overflow-hidden" style={backgroundStyle(backgroundMode, uploadedImageUrl)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={svgDataUrl(svg)} alt={t(`variants.${variant}.title`)} className="absolute inset-0 h-full w-full object-fill" />
              </div>
              <div className="space-y-3 border-t border-slate-200 bg-white p-4 text-slate-950">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{t(`variants.${variant}.title`)}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{t(`variants.${variant}.description`)}</p>
                  </div>
                  <button
                    type="button"
                    className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${selectedVariant === variant ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    onClick={() => setSelectedVariant(variant)}
                  >
                    {selectedVariant === variant ? t('selected') : t('select')}
                  </button>
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{variant}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">{t('selectedVariant')}</p>
              <h2 className="mt-2 text-2xl font-semibold">{t(`variants.${selectedVariant}.title`)}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50">{t(`variants.${selectedVariant}.description`)}</p>
            </div>
            <button
              type="button"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50"
              onClick={() => void navigator.clipboard.writeText(selectedSvg)}
            >
              {t('copySvg')}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
