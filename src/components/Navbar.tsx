'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from './LanguageSwitcher'
import { AppIcon } from '@/components/ui/icons'
import UpdateNoticeModal from './UpdateNoticeModal'
import { useGithubReleaseUpdate } from '@/hooks/common/useGithubReleaseUpdate'
import { Link } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'


export default function Navbar() {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const { currentVersion, update, shouldPulse, showModal, openModal, dismissCurrentUpdate, checkNow } = useGithubReleaseUpdate()
  const [checkMsg, setCheckMsg] = useState<string | null>(null)
  const [checkMsgFading, setCheckMsgFading] = useState(false)
  const [manualChecking, setManualChecking] = useState(false)
  const downloadLogsHref = '/api/admin/download-logs'

  const handleCheckUpdate = async () => {
    setCheckMsg(null)
    setCheckMsgFading(false)
    setManualChecking(true)
    const minSpin = new Promise(r => setTimeout(r, 1000))
    await Promise.all([checkNow(), minSpin])
    setManualChecking(false)
    setTimeout(() => {
      setCheckMsg('upToDate')
      setTimeout(() => setCheckMsgFading(true), 2000)
      setTimeout(() => { setCheckMsg(null); setCheckMsgFading(false) }, 3000)
    }, 100)
  }

  return (
    <>
      <nav className="glass-nav sticky top-0 z-50">
        <div className="mx-auto flex h-[4.5rem] max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <Link href={session ? buildAuthenticatedHomeTarget() : { pathname: '/' }} className="group flex items-center gap-3">
              <span className="studio-brand-badge transition-transform duration-300 group-hover:scale-110" aria-hidden="true">
                <span className="studio-brand-badge__letter">D</span>
              </span>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="studio-wordmark text-[20px]">{tc('appName')}</span>
                <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--glass-text-tertiary)]">
                  AI Director Console
                </span>
              </div>
            </Link>
            <div className="hidden lg:flex items-center gap-2">
              <button
                type="button"
                onClick={openModal}
                disabled={!update}
                className={`relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase transition-all ${update
                  ? 'border-[var(--glass-tone-warning-fg)]/40 bg-[linear-gradient(135deg,rgba(255,176,70,0.18),rgba(12,18,30,0.92))] text-[var(--glass-tone-warning-fg)] shadow-[0_18px_28px_-20px_rgba(255,176,70,0.9)] hover:-translate-y-px'
                  : 'border-[var(--glass-stroke-base)] bg-[rgba(17,24,38,0.76)] text-[var(--glass-text-secondary)] hover:border-[var(--glass-stroke-focus)] hover:text-[var(--glass-text-primary)] disabled:cursor-default'
                  }`}
                aria-label={tc('updateNotice.openDialog')}
              >
                <span className="inline-flex items-center gap-1.5">
                  <AppIcon name="sparkles" className="h-3.5 w-3.5" />
                  {tc('betaVersion', { version: currentVersion })}
                  {update ? (
                    <span className="relative inline-flex items-center">
                      {shouldPulse ? <span className="absolute -inset-1.5 animate-ping rounded-full bg-[var(--glass-tone-warning-fg)] opacity-20" /> : null}
                      <span className="relative inline-flex items-center gap-1 rounded-full bg-[var(--glass-tone-warning-fg)]/16 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                        <AppIcon name="upload" className="h-3 w-3" />
                        {tc('updateNotice.updateTag')}
                      </span>
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleCheckUpdate()}
                disabled={manualChecking}
                className="rounded-full border border-transparent p-2 text-[var(--glass-text-tertiary)] hover:border-[var(--glass-stroke-base)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-secondary)] transition-colors disabled:opacity-40"
                title={tc('updateNotice.checkUpdate')}
              >
                <AppIcon name="refresh" className={`h-3.5 w-3.5 ${manualChecking ? 'animate-spin' : ''}`} />
              </button>
              {checkMsg === 'upToDate' && !update && (
                <span
                  className="text-[11px] text-[var(--glass-tone-success-fg)] font-medium transition-opacity duration-1000"
                  style={{ opacity: checkMsgFading ? 0 : 1 }}
                >
                  ✓ {tc('updateNotice.upToDate')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
              {status === 'loading' ? (
                /* Session 加载中骨架屏 */
                <div className="flex items-center space-x-4">
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-4 w-16 rounded-full bg-[var(--glass-bg-muted)] animate-pulse" />
                  <div className="h-8 w-20 rounded-lg bg-[var(--glass-bg-muted)] animate-pulse" />
                </div>
              ) : session ? (
                <>
                  <Link
                    href={{ pathname: '/workspace' }}
                    className="hidden md:inline-flex text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors items-center gap-1"
                  >
                    <AppIcon name="monitor" className="w-4 h-4" />
                    {t('workspace')}
                  </Link>
                  <Link
                    href={{ pathname: '/workspace/asset-hub' }}
                    className="hidden md:inline-flex text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors items-center gap-1"
                  >
                    <AppIcon name="folderHeart" className="w-4 h-4" />
                    {t('assetHub')}
                  </Link>
                  <Link
                    href={{ pathname: '/profile' }}
                    className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors flex items-center gap-1"
                    title={t('profile')}
                  >
                    <AppIcon name="userRoundCog" className="w-5 h-5" />
                    <span className="hidden md:inline">{t('profile')}</span>
                  </Link>
                  <LanguageSwitcher />
                  <a
                    href={downloadLogsHref}
                    download
                    className="hidden xl:inline-flex text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors items-center gap-1"
                    title={t('downloadLogs')}
                  >
                    <AppIcon name="download" className="w-4 h-4" />
                    {t('downloadLogs')}
                  </a>
                </>

              ) : (
                <>
                  <Link
                    href={{ pathname: '/auth/signin' }}
                    className="hidden md:inline-flex text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] font-medium transition-colors"
                  >
                    {t('signin')}
                  </Link>
                  <Link
                    href={{ pathname: '/auth/signup' }}
                    className="glass-btn-base glass-btn-primary px-4 py-2 text-sm font-medium"
                  >
                    {t('signup')}
                  </Link>
                  <LanguageSwitcher />
                </>
              )}
          </div>
        </div>
      </nav>
      {update ? (
        <UpdateNoticeModal
          show={showModal}
          currentVersion={currentVersion}
          latestVersion={update.latestVersion}
          releaseUrl={update.releaseUrl}
          releaseName={update.releaseName}
          publishedAt={update.publishedAt}
          onDismiss={dismissCurrentUpdate}
        />
      ) : null}
    </>
  )
}
