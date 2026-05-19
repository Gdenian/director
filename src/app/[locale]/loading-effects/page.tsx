import { getTranslations } from 'next-intl/server'
import styles from './page.module.css'

type LoadingEffectVariant = {
  id: 'shortEdgeFlow' | 'longEdgeFlow' | 'softEdgeFlow' | 'dualEdgeFlow'
  effectClassName: string
}

const variants: LoadingEffectVariant[] = [
  {
    id: 'shortEdgeFlow',
    effectClassName: styles.shortEdgeFlow,
  },
  {
    id: 'longEdgeFlow',
    effectClassName: styles.longEdgeFlow,
  },
  {
    id: 'softEdgeFlow',
    effectClassName: styles.softEdgeFlow,
  },
  {
    id: 'dualEdgeFlow',
    effectClassName: styles.dualEdgeFlow,
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
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--glass-stroke-base)] bg-white">
                <div className={`${styles.previewFrame} ${variant.effectClassName}`}>
                  <PreviewScene />
                  <BorderFlow />
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

function BorderFlow() {
  return (
    <div className={styles.borderFlow} aria-hidden="true">
      <span className={`${styles.flowSegment} ${styles.flowTop} ${styles.flowPrimary}`} />
      <span className={`${styles.flowSegment} ${styles.flowRight} ${styles.flowPrimary}`} />
      <span className={`${styles.flowSegment} ${styles.flowBottom} ${styles.flowPrimary}`} />
      <span className={`${styles.flowSegment} ${styles.flowLeft} ${styles.flowPrimary}`} />
      <span className={`${styles.flowSegment} ${styles.flowTop} ${styles.flowSecondary}`} />
      <span className={`${styles.flowSegment} ${styles.flowRight} ${styles.flowSecondary}`} />
      <span className={`${styles.flowSegment} ${styles.flowBottom} ${styles.flowSecondary}`} />
      <span className={`${styles.flowSegment} ${styles.flowLeft} ${styles.flowSecondary}`} />
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
