'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'

export default function Home() {
  const t = useTranslations('landing')
  const { data: session, status } = useSession()
  const router = useRouter()

  // 已登录用户自动跳转到 home
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(buildAuthenticatedHomeTarget())
    }
  }, [status, router])

  // session 加载中或已登录（即将跳转），不渲染落地页，避免闪烁
  if (status !== 'unauthenticated') {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="studio-brand-badge studio-brand-badge-lg animate-pulse" aria-hidden="true">
            <span className="studio-brand-badge__letter">D</span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="studio-shell glass-page min-h-screen overflow-hidden font-sans selection:bg-[var(--glass-tone-info-bg)]">
      {/* Navbar */}
      <div className="relative z-50">
        <Navbar />
      </div>

      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,208,255,0.12),transparent_24%),radial-gradient(circle_at_85%_0%,rgba(79,141,255,0.18),transparent_28%),linear-gradient(180deg,#0a0f18_0%,#060910_100%)]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(138,154,191,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(138,154,191,0.06)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.62),transparent_78%)]" />
      </div>

      <main className="studio-grid relative z-10">
        <section className="relative flex min-h-screen items-center px-4 pt-10 pb-20">
          <div className="mx-auto grid w-full max-w-[1380px] items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
            <div className="relative z-10 space-y-8">
              <span className="studio-kicker animate-fade-in" style={{ animationDelay: '0.12s' }}>
                <span className="h-2 w-2 rounded-full bg-[var(--glass-tone-info-fg)]" />
                {t('kicker')}
              </span>
              <div className="animate-slide-up space-y-6" style={{ animationDuration: '0.8s' }}>
                <h1 className="studio-display max-w-4xl text-5xl font-bold leading-[0.96] tracking-[0.01em] text-[var(--glass-text-primary)] md:text-7xl xl:text-[6.25rem]">
                  <span className="block">{t('title')}</span>
                  <span className="block text-[var(--glass-tone-info-fg)]">{t('subtitle')}</span>
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[var(--glass-text-secondary)] md:text-lg">
                  {t('pitch')}
                </p>
              </div>

              <div className="flex flex-wrap gap-4 pt-2 animate-fade-in" style={{ animationDelay: '0.42s' }}>
                <Link
                  href={{ pathname: '/auth/signup' }}
                  className="glass-btn-base glass-btn-primary px-8 py-4 rounded-xl font-semibold transition-all duration-300"
                >
                  {t('getStarted')}
                </Link>
                <Link
                  href={{ pathname: '/auth/signin' }}
                  className="glass-btn-base glass-btn-secondary px-8 py-4 rounded-xl font-semibold transition-all duration-300"
                >
                  {t('enterWorkspace')}
                </Link>
              </div>

              <div className="grid gap-4 pt-6 md:grid-cols-3">
                <div className="studio-hero-panel p-5">
                  <div className="studio-section-title text-xs text-[var(--glass-text-tertiary)]">{t('cards.style.label')}</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--glass-text-primary)]">{t('cards.style.title')}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">
                    {t('cards.style.description')}
                  </p>
                </div>
                <div className="studio-hero-panel p-5">
                  <div className="studio-section-title text-xs text-[var(--glass-text-tertiary)]">{t('cards.run.label')}</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--glass-text-primary)]">{t('cards.run.title')}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">
                    {t('cards.run.description')}
                  </p>
                </div>
                <div className="studio-hero-panel p-5">
                  <div className="studio-section-title text-xs text-[var(--glass-text-tertiary)]">{t('cards.episode.label')}</div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--glass-text-primary)]">{t('cards.episode.title')}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">
                    {t('cards.episode.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative hidden min-h-[680px] items-center justify-center lg:flex">
              <div className="relative h-[620px] w-full max-w-[540px] animate-scale-in" style={{ animationDuration: '1s' }}>
                <div className="absolute -right-6 top-4 studio-media-frame h-[280px] w-[280px] rotate-[8deg] p-5">
                  <div className="flex h-full flex-col justify-between rounded-[22px] border border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,rgba(28,42,64,0.9)_0%,rgba(9,15,25,0.96)_100%)] p-5">
                    <div className="flex items-center justify-between">
                      <span className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('showcase.styleLabel')}</span>
                      <span className="glass-chip glass-chip-info">active</span>
                    </div>
                    <div className="relative mt-4 flex-1 overflow-hidden rounded-[18px] border border-[var(--glass-stroke-soft)] bg-[radial-gradient(circle_at_25%_18%,rgba(99,208,255,0.28),transparent_25%),linear-gradient(135deg,#17253c_0%,#0b1424_100%)]">
                      <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,transparent,rgba(5,8,15,0.88))]" />
                      <div className="absolute left-4 top-4 studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('showcase.styleLabel')}</div>
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('showcase.styleTitle')}</div>
                        <div className="mt-1 text-xs leading-5 text-[var(--glass-text-secondary)]">{t('showcase.styleDescription')}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute left-0 top-24 studio-media-frame h-[360px] w-[320px] -rotate-[6deg] p-4">
                  <div className="flex h-full flex-col rounded-[22px] border border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,rgba(14,21,34,0.92)_0%,rgba(8,13,22,0.98)_100%)] p-5">
                    <div className="flex items-center justify-between">
                      <span className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('showcase.storyboardLabel')}</span>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--glass-tone-info-fg)]" />
                    </div>
                    <div className="mt-5 grid flex-1 gap-3">
                      <div className="rounded-[18px] border border-[var(--glass-stroke-soft)] bg-[linear-gradient(135deg,rgba(22,34,54,0.92),rgba(11,18,29,0.98))] p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-[var(--glass-text-tertiary)]">{t('showcase.sceneLabel')}</div>
                        <div className="mt-2 text-base font-semibold text-[var(--glass-text-primary)]">{t('showcase.storyboardTitle')}</div>
                        <div className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">{t('showcase.storyboardDescription')}</div>
                      </div>
                      <div className="rounded-[18px] border border-[var(--glass-stroke-soft)] bg-[linear-gradient(135deg,rgba(18,28,44,0.92),rgba(9,15,24,0.98))] p-4">
                        <div className="flex items-center justify-between">
                          <span className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('showcase.statusLabel')}</span>
                          <span className="glass-chip glass-chip-success">{t('showcase.statusChip')}</span>
                        </div>
                        <div className="mt-4 space-y-2">
                          <div className="h-2 rounded-full bg-[rgba(255,255,255,0.06)]">
                            <div className="h-2 w-[76%] rounded-full bg-[linear-gradient(90deg,var(--glass-accent-from),var(--glass-accent-to))]" />
                          </div>
                          <div className="text-sm text-[var(--glass-text-secondary)]">{t('showcase.statusValue')}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-2 right-8 studio-hero-panel w-[290px] p-5">
                  <div className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('showcase.noteLabel')}</div>
                  <div className="mt-3 text-lg font-semibold text-[var(--glass-text-primary)]">{t('showcase.noteTitle')}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">
                    {t('showcase.noteDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
