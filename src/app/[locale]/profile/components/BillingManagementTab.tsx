'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-fetch'
import { AppIcon } from '@/components/ui/icons'

const PAGE_SIZE = 20

type TransactionFilter = 'all' | 'recharge' | 'consume'

export interface BillingBalance {
  currency: string
  balance: number
  frozenAmount: number
  totalSpent: number
}

export interface BillingBalanceState {
  data: BillingBalance | null
  loading: boolean
  error: boolean
  refresh?: () => void
}

interface CommercialPackage {
  key: string
  name: string
  description: string | null
  price: string
  currency: string
  credits: string
  bonusCredits: string
  durationDays: number | null
}

interface BillingMeta {
  quantity?: number
  unit?: string
  model?: string
  apiType?: string
  resolution?: string
  duration?: number | string
}

interface BillingTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string | null
  action: string | null
  projectName: string | null
  episodeNumber: number | null
  episodeName: string | null
  billingMeta: BillingMeta | null
  createdAt: string
}

interface TransactionPage {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface TransactionsPayload {
  currency: string
  transactions: BillingTransaction[]
  pagination: TransactionPage
}

interface ProjectCostSummary {
  projectId: string
  projectName: string
  totalCost: number
  recordCount: number
}

interface UserCostsPayload {
  currency: string
  total: number
  byProject: ProjectCostSummary[]
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatMoneyAmount(value: number | null | undefined, currency = 'CNY', locale = 'zh') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(value)
}

function formatDateTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function translateProfileKey(t: ReturnType<typeof useTranslations>, key: string, fallback: string) {
  try {
    const translated = t(key as Parameters<typeof t>[0])
    return translated === key ? fallback : translated
  } catch {
    return fallback
  }
}

function formatActionLabel(action: string | null, description: string | null, t: ReturnType<typeof useTranslations>) {
  if (action) return translateProfileKey(t, `actionTypes.${action}`, action.replace(/[_-]/g, ' '))
  return description || '-'
}

function formatBillingMeta(meta: BillingMeta | null, locale: string) {
  if (!meta?.quantity || !meta.unit) return null

  const quantity = meta.quantity
  if (locale === 'zh') {
    if (meta.unit === 'image') return meta.resolution ? `${quantity}张 · ${meta.resolution}` : `${quantity}张`
    if (meta.unit === 'video') return meta.resolution ? `${quantity}段 · ${meta.resolution}` : `${quantity}段`
    if (meta.unit === 'token') return `${quantity} tokens`
    if (meta.unit === 'second') return `${quantity}秒`
    if (meta.unit === 'call') return `${quantity}次`
  }

  if (meta.unit === 'image') return meta.resolution ? `${quantity} images · ${meta.resolution}` : `${quantity} images`
  if (meta.unit === 'video') return meta.resolution ? `${quantity} videos · ${meta.resolution}` : `${quantity} videos`
  if (meta.unit === 'token') return `${quantity} tokens`
  if (meta.unit === 'second') return `${quantity}s`
  if (meta.unit === 'call') return `${quantity} calls`
  return `${quantity} ${meta.unit}`
}

function getTransactionTypeLabel(type: string, t: ReturnType<typeof useTranslations>) {
  if (type === 'recharge') return t('recharge')
  if (type === 'consume' || type === 'shadow_consume') return t('consume')
  return type
}

export function useBillingBalance(enabled = true): BillingBalanceState {
  const [refreshToken, setRefreshToken] = useState(0)
  const [state, setState] = useState<BillingBalanceState>({
    data: null,
    loading: enabled,
    error: false,
  })

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: false })
      return
    }

    const controller = new AbortController()
    setState((previous) => ({ ...previous, loading: true, error: false }))

    void apiFetch('/api/user/balance', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to fetch balance')
        const payload = await response.json() as Record<string, unknown>
        setState({
          data: {
            currency: String(payload.currency || 'CNY'),
            balance: toFiniteNumber(payload.balance),
            frozenAmount: toFiniteNumber(payload.frozenAmount),
            totalSpent: toFiniteNumber(payload.totalSpent),
          },
          loading: false,
          error: false,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState((previous) => ({ ...previous, loading: false, error: true }))
      })

    return () => controller.abort()
  }, [enabled, refreshToken])

  return {
    ...state,
    refresh: () => setRefreshToken((value) => value + 1),
  }
}

interface BillingManagementTabProps {
  balanceState: BillingBalanceState
  refreshToken?: number
}

export default function BillingManagementTab({ balanceState, refreshToken = 0 }: BillingManagementTabProps) {
  const locale = useLocale()
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const [costs, setCosts] = useState<UserCostsPayload | null>(null)
  const [costsLoading, setCostsLoading] = useState(true)
  const [costsError, setCostsError] = useState(false)
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all')
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactions, setTransactions] = useState<TransactionsPayload | null>(null)
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionsError, setTransactionsError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setCostsLoading(true)
    setCostsError(false)

    void apiFetch('/api/user/costs', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to fetch user costs')
        const payload = await response.json() as Record<string, unknown>
        const rawProjects = Array.isArray(payload.byProject) ? payload.byProject : []
        setCosts({
          currency: String(payload.currency || 'CNY'),
          total: toFiniteNumber(payload.total),
          byProject: rawProjects.map((item) => {
            const project = item as Record<string, unknown>
            return {
              projectId: String(project.projectId || ''),
              projectName: String(project.projectName || ''),
              totalCost: toFiniteNumber(project.totalCost),
              recordCount: toFiniteNumber(project.recordCount),
            }
          }),
        })
        setCostsLoading(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setCostsLoading(false)
        setCostsError(true)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      page: String(transactionPage),
      pageSize: String(PAGE_SIZE),
    })
    if (transactionFilter !== 'all') params.set('type', transactionFilter)

    setTransactionsLoading(true)
    setTransactionsError(false)

    void apiFetch(`/api/user/transactions?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to fetch transactions')
        const payload = await response.json() as Record<string, unknown>
        const rawTransactions = Array.isArray(payload.transactions) ? payload.transactions : []
        const pagination = (payload.pagination || {}) as Record<string, unknown>
        setTransactions({
          currency: String(payload.currency || 'CNY'),
          transactions: rawTransactions.map((item) => {
            const transaction = item as Record<string, unknown>
            return {
              id: String(transaction.id || ''),
              type: String(transaction.type || ''),
              amount: toFiniteNumber(transaction.amount),
              balanceAfter: toFiniteNumber(transaction.balanceAfter),
              description: typeof transaction.description === 'string' ? transaction.description : null,
              action: typeof transaction.action === 'string' ? transaction.action : null,
              projectName: typeof transaction.projectName === 'string' ? transaction.projectName : null,
              episodeNumber: typeof transaction.episodeNumber === 'number' ? transaction.episodeNumber : null,
              episodeName: typeof transaction.episodeName === 'string' ? transaction.episodeName : null,
              billingMeta: transaction.billingMeta && typeof transaction.billingMeta === 'object'
                ? transaction.billingMeta as BillingMeta
                : null,
              createdAt: String(transaction.createdAt || ''),
            }
          }),
          pagination: {
            page: toFiniteNumber(pagination.page) || 1,
            pageSize: toFiniteNumber(pagination.pageSize) || PAGE_SIZE,
            total: toFiniteNumber(pagination.total),
            totalPages: toFiniteNumber(pagination.totalPages),
          },
        })
        setTransactionsLoading(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setTransactionsLoading(false)
        setTransactionsError(true)
      })

    return () => controller.abort()
  }, [transactionFilter, transactionPage, refreshToken])

  const currency = balanceState.data?.currency || costs?.currency || transactions?.currency || 'CNY'
  const totalCost = costs?.total ?? 0
  const transactionPagination = transactions?.pagination
  const canGoPrevious = transactionPagination ? transactionPagination.page > 1 : false
  const canGoNext = transactionPagination
    ? transactionPagination.totalPages > 0 && transactionPagination.page < transactionPagination.totalPages
    : false

  const handleFilterChange = (nextFilter: TransactionFilter) => {
    setTransactionFilter(nextFilter)
    setTransactionPage(1)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-stroke-base)] px-6 py-5">
        <div>
          <h1 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('billingRecords')}</h1>
          <p className="text-sm text-[var(--glass-text-tertiary)]">{t('accountTransactions')}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-stroke-base)] px-3 py-1.5 text-sm text-[var(--glass-text-secondary)]">
          <AppIcon name="coins" className="h-4 w-4" />
          {t('totalCost', { amount: formatMoneyAmount(totalCost, currency, locale) })}
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <section className="grid gap-3 md:grid-cols-3">
          {[
            {
              label: t('availableBalance'),
              value: balanceState.loading ? tc('loading') : formatMoneyAmount(balanceState.data?.balance, currency, locale),
              icon: 'coins' as const,
            },
            {
              label: t('frozen'),
              value: balanceState.loading ? tc('loading') : formatMoneyAmount(balanceState.data?.frozenAmount, currency, locale),
              icon: 'lock' as const,
            },
            {
              label: t('totalSpent'),
              value: balanceState.loading ? tc('loading') : formatMoneyAmount(balanceState.data?.totalSpent, currency, locale),
              icon: 'receipt' as const,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--glass-text-secondary)]">{item.label}</span>
                <AppIcon name={item.icon} className="h-4 w-4 text-[var(--glass-text-tertiary)]" />
              </div>
              <div className="text-xl font-semibold text-[var(--glass-text-primary)]">{balanceState.error ? tc('operationFailed') : item.value}</div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-stroke-base)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('projectDetails')}</h2>
            <span className="text-xs text-[var(--glass-text-tertiary)]">
              {t('recordCount', { count: costs?.byProject.length ?? 0 })}
            </span>
          </div>
          <div className="divide-y divide-[var(--glass-stroke-base)]">
            {costsLoading ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">{tc('loading')}</div>
            ) : costsError ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--glass-tone-danger-fg)]">{tc('operationFailed')}</div>
            ) : !costs?.byProject.length ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">{t('noProjectCosts')}</div>
            ) : (
              costs.byProject.map((project) => (
                <div key={project.projectId} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_auto_auto]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--glass-text-primary)]">{project.projectName}</div>
                    <div className="text-xs text-[var(--glass-text-tertiary)]">{t('recordCount', { count: project.recordCount })}</div>
                  </div>
                  <div className="text-[var(--glass-text-secondary)]">{t('total')}</div>
                  <div className="font-semibold text-[var(--glass-text-primary)]">
                    {formatMoneyAmount(project.totalCost, costs.currency, locale)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-stroke-base)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('transactions')}</h2>
            <div className="flex items-center gap-2">
              {([
                ['all', t('allTypes')],
                ['recharge', t('recharge')],
                ['consume', t('consume')],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleFilterChange(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${transactionFilter === value
                    ? 'glass-btn-base glass-btn-tone-info'
                    : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[var(--glass-stroke-base)]">
            {transactionsLoading ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">{tc('loading')}</div>
            ) : transactionsError ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--glass-tone-danger-fg)]">{tc('operationFailed')}</div>
            ) : !transactions?.transactions.length ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">{t('noTransactions')}</div>
            ) : (
              transactions.transactions.map((transaction) => {
                const amountTone = transaction.amount >= 0
                  ? 'text-[var(--glass-tone-success-fg)]'
                  : 'text-[var(--glass-tone-danger-fg)]'
                const detail = formatBillingMeta(transaction.billingMeta, locale)
                return (
                  <div key={transaction.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[var(--glass-text-primary)]">
                          {formatActionLabel(transaction.action, transaction.description, t)}
                        </span>
                        <span className="rounded-full bg-[var(--glass-bg-muted)] px-2 py-0.5 text-xs text-[var(--glass-text-tertiary)]">
                          {getTransactionTypeLabel(transaction.type, t)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--glass-text-tertiary)]">
                        <span>{formatDateTime(transaction.createdAt, locale)}</span>
                        {transaction.projectName && <span>{transaction.projectName}</span>}
                        {transaction.episodeNumber && <span>{t('episodeLabel', { number: transaction.episodeNumber })}</span>}
                        {detail && <span>{detail}</span>}
                        {transaction.billingMeta?.model && <span>{transaction.billingMeta.model}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${amountTone}`}>
                        {formatMoneyAmount(transaction.amount, transactions.currency, locale)}
                      </div>
                      <div className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
                        {t('balanceAfter', { amount: formatMoneyAmount(transaction.balanceAfter, transactions.currency, locale) })}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {transactionPagination && transactionPagination.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--glass-stroke-base)] px-4 py-3 text-xs text-[var(--glass-text-tertiary)]">
              <span>
                {t('pagination', {
                  total: transactionPagination.total,
                  page: transactionPagination.page,
                  totalPages: Math.max(transactionPagination.totalPages, 1),
                })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canGoPrevious}
                  onClick={() => setTransactionPage((page) => Math.max(page - 1, 1))}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('previousPage')}
                </button>
                <button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => setTransactionPage((page) => page + 1)}
                  className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('nextPage')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
