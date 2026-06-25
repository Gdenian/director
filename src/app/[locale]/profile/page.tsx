'use client'
import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import ApiConfigTab from './components/ApiConfigTab'
import BillingManagementTab, { formatMoneyAmount, useBillingBalance } from './components/BillingManagementTab'
import { AppIcon } from '@/components/ui/icons'
import { useRouter } from '@/i18n/navigation'
import { ProfileAnnouncementMessages } from '@/components/announcements/ProfileAnnouncementMessages'
import { apiFetch } from '@/lib/api-fetch'

type ProfileSection = 'apiConfig' | 'modelSelection' | 'billing'
type CommercialPackage = {
  key: string
  name: string
  description: string | null
  price: string
  currency: string
  credits: string
  bonusCredits: string
  durationDays: number | null
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const balanceState = useBillingBalance(Boolean(session))
  const [packages, setPackages] = useState<CommercialPackage[]>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [packagesError, setPackagesError] = useState<string | null>(null)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemBusy, setRedeemBusy] = useState(false)
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [billingRefreshToken, setBillingRefreshToken] = useState(0)

  // 主要分区：创作引擎 / 模型选择 / 扣费记录
  const [activeSection, setActiveSection] = useState<ProfileSection>('apiConfig')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.push({ pathname: '/auth/signin' }); return }
  }, [router, session, status])

  useEffect(() => {
    if (!session || activeSection !== 'billing') return

    const controller = new AbortController()
    setPackagesLoading(true)
    setPackagesError(null)
    void apiFetch('/api/commercial/packages', { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>
        if (!response.ok) throw new Error(String(payload.message || tc('operationFailed')))
        const rawItems = Array.isArray(payload.items) ? payload.items : []
        setPackages(rawItems.map((item) => {
          const row = item as Record<string, unknown>
          return {
            key: String(row.key || ''),
            name: String(row.name || ''),
            description: typeof row.description === 'string' ? row.description : null,
            price: String(row.price || '0'),
            currency: String(row.currency || 'CNY'),
            credits: String(row.credits || '0'),
            bonusCredits: String(row.bonusCredits || '0'),
            durationDays: typeof row.durationDays === 'number' ? row.durationDays : null,
          }
        }).filter((item) => item.key))
        setPackagesLoading(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPackagesLoading(false)
        setPackagesError(error instanceof Error ? error.message : tc('operationFailed'))
      })

    return () => controller.abort()
  }, [activeSection, session, tc])

  const parseApiMessage = async (response: Response) => {
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    return {
      payload,
      message: String(payload.message || tc('operationFailed')),
    }
  }

  const handleRedeemSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRedeemBusy(true)
    setRedeemMessage(null)
    setRedeemError(null)
    try {
      const response = await apiFetch('/api/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: redeemCode,
          idempotencyKey: `redeem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        }),
      })
      const { payload, message } = await parseApiMessage(response)
      if (!response.ok) throw new Error(message)
      setRedeemCode('')
      setRedeemMessage(`兑换成功，已入账 ${String(payload.credits || '')}`)
      balanceState.refresh?.()
      setBillingRefreshToken((value) => value + 1)
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : tc('operationFailed'))
    } finally {
      setRedeemBusy(false)
    }
  }

  const handleCreateOrder = async (packageKey: string) => {
    setPackagesError(null)
    try {
      const response = await apiFetch('/api/commercial/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packageKey,
          idempotencyKey: `order_${packageKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        }),
      })
      const { message } = await parseApiMessage(response)
      if (!response.ok) throw new Error(message)
    } catch (error) {
      setPackagesError(error instanceof Error ? error.message : tc('operationFailed'))
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page flex min-h-screen items-center justify-center">
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  const balanceText = balanceState.loading
    ? tc('loading')
    : balanceState.error
      ? tc('operationFailed')
      : formatMoneyAmount(balanceState.data?.balance, balanceState.data?.currency, locale)

  return (
    <div className="glass-page min-h-screen">
      <Navbar />

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <ProfileAnnouncementMessages />
        <div className="flex gap-6 h-[calc(100vh-140px)]">

          {/* 左侧侧边栏 */}
          <div className="w-64 flex-shrink-0">
            <div className="glass-surface-elevated h-full flex flex-col p-5">

              {/* 用户信息 */}
              <div className="mb-6">
                <div className="mb-4">
                  <h2 className="font-semibold text-[var(--glass-text-primary)]">{session.user?.name || t('user')}</h2>
                  <p className="text-xs text-[var(--glass-text-tertiary)]">{t('personalAccount')}</p>
                </div>

                {/* 余额卡片 */}
                <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
                  <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{t('availableBalance')}</div>
                  <div className="mt-2 text-base font-semibold text-[var(--glass-text-primary)]">{balanceText}</div>
                </div>
              </div>

              {/* 导航菜单 */}
              <nav className="flex-1 space-y-2">
                <button
                  onClick={() => setActiveSection('apiConfig')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'apiConfig'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                    }`}
                >
                  <AppIcon name="settingsHexAlt" className="w-5 h-5" />
                  <span className="font-medium">{t('apiConfig')}</span>
                </button>

                <button
                  onClick={() => setActiveSection('modelSelection')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'modelSelection'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                    }`}
                >
                  <AppIcon name="cpu" className="w-5 h-5" />
                  <span className="font-medium">{t('modelSelection')}</span>
                </button>

                <button
                  onClick={() => setActiveSection('billing')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all cursor-pointer ${activeSection === 'billing'
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
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
            <div className="glass-surface-elevated h-full flex flex-col">

              {activeSection === 'apiConfig' ? (
                <ApiConfigTab
                  view="engines"
                  onOpenModelSelection={() => setActiveSection('modelSelection')}
                />
              ) : activeSection === 'modelSelection' ? (
                <ApiConfigTab view="models" />
              ) : (
                <>
                  <section className="border-b border-[var(--glass-stroke-base)] px-6 py-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <AppIcon name="package" className="h-4 w-4 text-[var(--glass-text-tertiary)]" />
                          <h2 className="text-sm font-semibold text-[var(--glass-text-primary)]">套餐</h2>
                        </div>
                        {packagesLoading ? (
                          <div className="text-sm text-[var(--glass-text-tertiary)]">{tc('loading')}</div>
                        ) : packagesError ? (
                          <div className="text-sm text-[var(--glass-tone-danger-fg)]">{packagesError}</div>
                        ) : packages.length === 0 ? (
                          <div className="text-sm text-[var(--glass-text-tertiary)]">暂无可购买套餐</div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {packages.map((item) => {
                              const credits = Number(item.credits) + Number(item.bonusCredits || 0)
                              return (
                                <div key={item.key} className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="font-medium text-[var(--glass-text-primary)]">{item.name}</div>
                                      {item.description && <div className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{item.description}</div>}
                                    </div>
                                    <div className="text-sm font-semibold text-[var(--glass-text-primary)]">
                                      {formatMoneyAmount(Number(item.price), item.currency, locale)}
                                    </div>
                                  </div>
                                  <div className="mt-3 text-xs text-[var(--glass-text-secondary)]">
                                    {formatMoneyAmount(credits, item.currency, locale)} 额度
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void handleCreateOrder(item.key)}
                                    className="glass-btn-base glass-btn-tone-info mt-3 rounded-lg px-3 py-1.5 text-xs font-medium"
                                  >
                                    购买
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <form onSubmit={handleRedeemSubmit} className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <AppIcon name="coins" className="h-4 w-4 text-[var(--glass-text-tertiary)]" />
                          <h2 className="text-sm font-semibold text-[var(--glass-text-primary)]">兑换码</h2>
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={redeemCode}
                            onChange={(event) => setRedeemCode(event.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none focus:border-[var(--glass-tone-info-border)]"
                            placeholder="输入兑换码"
                          />
                          <button
                            type="submit"
                            disabled={redeemBusy || !redeemCode.trim()}
                            className="glass-btn-base glass-btn-tone-info rounded-lg px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            兑换
                          </button>
                        </div>
                        {redeemError && <div className="mt-2 text-xs text-[var(--glass-tone-danger-fg)]">{redeemError}</div>}
                        {redeemMessage && <div className="mt-2 text-xs text-[var(--glass-tone-success-fg)]">{redeemMessage}</div>}
                      </form>
                    </div>
                  </section>
                  <BillingManagementTab balanceState={balanceState} refreshToken={billingRefreshToken} />
                </>
              )}
            </div>
          </div>
        </div>
      </main >
    </div >
  )
}
