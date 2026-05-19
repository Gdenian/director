import { getTranslations } from 'next-intl/server'
import styles from './page.module.css'

type LoadingEffectVariant = {
  id: 'currentSweep' | 'singleOrbit' | 'dualOrbit' | 'cornerFlow' | 'softPulse' | 'dashedTrack'
  effectClassName: string
  accentClassName: string
}

const variants: LoadingEffectVariant[] = [
  {
    id: 'currentSweep',
    effectClassName: styles.currentSweep,
    accentClassName: styles.accentBlue,
  },
  {
    id: 'singleOrbit',
    effectClassName: styles.singleOrbit,
    accentClassName: styles.accentCyan,
  },
  {
    id: 'dualOrbit',
    effectClassName: styles.dualOrbit,
    accentClassName: styles.accentBlue,
  },
  {
    id: 'cornerFlow',
    effectClassName: styles.cornerFlow,
    accentClassName: styles.accentGreen,
  },
  {
    id: 'softPulse',
    effectClassName: styles.softPulse,
    accentClassName: styles.accentAmber,
  },
  {
    id: 'dashedTrack',
    effectClassName: styles.dashedTrack,
    accentClassName: styles.accentSlate,
  },
]

export default async function LoadingEffectsPage() {
  const t = await getTranslations('loadingEffects')

  return (
    <main className="min-h-screen bg-[var(--glass-bg-canvas)] px-5 py-8 text-[var(--glass-text-primary)] md:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-[var(--glass-stroke-base)] pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--glass-tone-info-fg)]">
            {t('eyebrow')}
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">{t('title')}</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--glass-text-tertiary)] md:text-base">
                {t('description')}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-3 text-sm text-[var(--glass-text-secondary)] shadow-[var(--glass-shadow-sm)]">
              {t('hint')}
            </div>
          </div>
        </header>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {variants.map((variant) => (
            <article
              key={variant.id}
              className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4 shadow-[var(--glass-shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--glass-text-primary)]">
                    {t(`variants.${variant.id}.title`)}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--glass-text-tertiary)]">
                    {t(`variants.${variant.id}.summary`)}
                  </p>
                </div>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${variant.accentClassName}`} />
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--glass-stroke-base)] bg-white">
                <div className={`${styles.previewFrame} ${variant.effectClassName}`}>
                  <PreviewScene />
                  <PerimeterTrack />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-[var(--glass-bg-muted)] px-3 py-2">
                  <dt className="font-medium text-[var(--glass-text-primary)]">{t('fields.motion')}</dt>
                  <dd className="mt-1 leading-5 text-[var(--glass-text-tertiary)]">
                    {t(`variants.${variant.id}.motion`)}
                  </dd>
                </div>
                <div className="rounded-lg bg-[var(--glass-bg-muted)] px-3 py-2">
                  <dt className="font-medium text-[var(--glass-text-primary)]">{t('fields.fit')}</dt>
                  <dd className="mt-1 leading-5 text-[var(--glass-text-tertiary)]">
                    {t(`variants.${variant.id}.fit`)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function PerimeterTrack() {
  return (
    <div className={styles.perimeterTrack} aria-hidden="true">
      <span className={`${styles.edgeSegment} ${styles.edgeTop} ${styles.edgePrimary}`} />
      <span className={`${styles.edgeSegment} ${styles.edgeRight} ${styles.edgePrimary}`} />
      <span className={`${styles.edgeSegment} ${styles.edgeBottom} ${styles.edgePrimary}`} />
      <span className={`${styles.edgeSegment} ${styles.edgeLeft} ${styles.edgePrimary}`} />
      <span className={`${styles.edgeSegment} ${styles.edgeTop} ${styles.edgeSecondary}`} />
      <span className={`${styles.edgeSegment} ${styles.edgeRight} ${styles.edgeSecondary}`} />
      <span className={`${styles.edgeSegment} ${styles.edgeBottom} ${styles.edgeSecondary}`} />
      <span className={`${styles.edgeSegment} ${styles.edgeLeft} ${styles.edgeSecondary}`} />
    </div>
  )
}

function PreviewScene() {
  return (
    <div className={styles.previewContent} aria-hidden="true">
      <div className={styles.previewSky} />
      <div className={styles.previewSun} />
      <div className={styles.previewRidgeBack} />
      <div className={styles.previewRidgeFront} />
      <div className={styles.previewPanel}>
        <span className={styles.previewLineLong} />
        <span className={styles.previewLineShort} />
      </div>
    </div>
  )
}
