'use client'
import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ApiConfigTab from './components/ApiConfigTab'
import { AppIcon } from '@/components/ui/icons'
import { useRouter } from '@/i18n/navigation'
import { AnimatedBackground } from '@/components/ui/SharedComponents'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('profile')
  const tc = useTranslations('common')

  // 主要分区：扣费记录 / API配置
  const [activeSection, setActiveSection] = useState<'billing' | 'apiConfig'>('apiConfig')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.push({ pathname: '/auth/signin' }); return }
  }, [router, session, status])

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page flex min-h-screen items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  const noBillingText = t('openSourceNoBilling')

  return (
    <div className="studio-shell glass-page min-h-screen">
      <AnimatedBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-[1400px] px-6 py-8">
        <div className="studio-hero-panel mb-6 overflow-hidden p-6 md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="studio-kicker w-fit">
                <span className="h-2 w-2 rounded-full bg-[var(--glass-tone-info-fg)]" />
                {t('heroKicker')}
              </div>
              <h1 className="studio-display mt-5 text-3xl font-bold tracking-[0.03em] text-[var(--glass-text-primary)] md:text-5xl">
                {session.user?.name || t('user')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--glass-text-secondary)] md:text-base">
                {t('heroDescription')}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="studio-media-frame min-w-[220px] p-4">
                <div className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('heroApiLabel')}</div>
                <div className="mt-2 text-xl font-semibold text-[var(--glass-text-primary)]">{t('heroApiTitle')}</div>
                <div className="mt-1 text-xs leading-6 text-[var(--glass-text-secondary)]">{t('heroApiDescription')}</div>
              </div>
              <div className="studio-media-frame min-w-[220px] p-4">
                <div className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('heroBillingLabel')}</div>
                <div className="mt-2 text-xl font-semibold text-[var(--glass-text-primary)]">{t('heroBillingTitle')}</div>
                <div className="mt-1 text-xs leading-6 text-[var(--glass-text-secondary)]">{t('heroBillingDescription')}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-6 h-[calc(100vh-250px)] min-h-[620px]">

          {/* 左侧侧边栏 */}
          <div className="w-64 flex-shrink-0">
            <div className="glass-surface-elevated h-full flex flex-col p-5">
              <div className="studio-section-title mb-4 text-[10px] text-[var(--glass-text-tertiary)]">{t('panelKicker')}</div>

              {/* 用户信息 */}
              <div className="mb-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{session.user?.name || t('user')}</h2>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--glass-text-tertiary)]">{t('personalAccount')}</p>
                </div>

                {/* 余额卡片 */}
                <div className="studio-media-frame rounded-2xl p-4">
                  <div className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('availableBalance')}</div>
                  <div className="mt-2 text-base font-semibold text-[var(--glass-text-primary)]">{noBillingText}</div>
                </div>
              </div>

              {/* 导航菜单 */}
              <nav className="flex-1 space-y-2">
                <button
                  onClick={() => setActiveSection('apiConfig')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'apiConfig'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]'
                    }`}
                >
                  <AppIcon name="settingsHexAlt" className="w-5 h-5" />
                  <span className="font-medium">{t('apiConfig')}</span>
                </button>

                <button
                  onClick={() => setActiveSection('billing')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'billing'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]'
                    }`}
                >
                  <AppIcon name="receipt" className="w-5 h-5" />
                  <span className="font-medium">{t('billingRecords')}</span>
                </button>
              </nav>
              {/* 退出登录 */}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="glass-btn-base glass-btn-tone-danger mt-auto flex items-center gap-2 px-4 py-3 text-sm rounded-xl transition-all cursor-pointer"
              >
                <AppIcon name="logout" className="w-4 h-4" />
                {t('logout')}
              </button>
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 min-w-0">
            <div className="glass-surface-elevated h-full flex flex-col overflow-hidden">

              {activeSection === 'apiConfig' ? (
                <ApiConfigTab />
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <AppIcon name="receipt" className="mb-4 h-12 w-12 text-[var(--glass-text-tertiary)]" />
                  <p className="text-base font-semibold text-[var(--glass-text-primary)]">{noBillingText}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main >
    </div >
  )
}
