'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import Navbar from '@/components/Navbar'

import {
  fetchAdminAuditLogs,
  fetchAdminBilling,
  fetchAdminModels,
  fetchAdminOverview,
  fetchAdminSystemHealth,
  fetchAdminTasks,
  fetchAdminUsers,
} from './admin-api'
import type {
  AdminAuditLog,
  AdminAuditLogsResponse,
  AdminBillingResponse,
  AdminBillingTransaction,
  AdminModelsResponse,
  AdminOverviewResponse,
  AdminSystemHealthResponse,
  AdminTaskSummary,
  AdminTasksResponse,
  AdminUsersResponse,
  AdminUserSummary,
} from './types'

type AdminTab = 'overview' | 'users' | 'billing' | 'tasks' | 'models' | 'system' | 'audit'

interface AdminConsoleData {
  overview: AdminOverviewResponse
  users: AdminUsersResponse
  billing: AdminBillingResponse
  tasks: AdminTasksResponse
  models: AdminModelsResponse
  system: AdminSystemHealthResponse
  audit: AdminAuditLogsResponse
}

const tabs: AdminTab[] = ['overview', 'users', 'billing', 'tasks', 'models', 'system', 'audit']

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function text(value: string | number | null | undefined, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
      <div className="border-b border-[var(--glass-stroke-base)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--glass-text-primary)]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">{label}</div>
}

function MonoCell({ value }: { value: string | null | undefined }) {
  return <span className="block max-w-[180px] truncate font-mono text-xs">{text(value)}</span>
}

function LongCell({ value }: { value: string | null | undefined }) {
  return <span className="block max-w-[260px] break-all text-xs leading-5">{text(value)}</span>
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full bg-[var(--glass-bg-muted)] px-2 py-0.5 text-xs font-medium text-[var(--glass-text-secondary)]">
      {value}
    </span>
  )
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <table className="min-w-full divide-y divide-[var(--glass-stroke-base)] text-left text-xs">
      {children}
    </table>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3 py-2 font-medium text-[var(--glass-text-tertiary)]">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-3 py-2 align-top text-[var(--glass-text-secondary)]">
      {children}
    </td>
  )
}

function PaginationNote({ total, page, pageSize }: { total: number, page: number, pageSize: number }) {
  const t = useTranslations('admin')
  return (
    <div className="border-t border-[var(--glass-stroke-base)] px-4 py-2 text-xs text-[var(--glass-text-tertiary)]">
      {t('pagination', { total, page, pageSize })}
    </div>
  )
}

function OverviewPanel({ overview }: { overview: AdminOverviewResponse }) {
  const t = useTranslations('admin')
  const metrics = [
    ['totalUsers', overview.totalUsers],
    ['newUsersToday', overview.newUsersToday],
    ['tasksToday', overview.tasksToday],
    ['failedTasks', overview.failedTasks],
    ['queuedTasks', overview.queuedTasks],
    ['runningTasks', overview.runningTasks],
    ['usageCostToday', overview.usageCostToday],
    ['totalBalance', overview.totalBalance],
    ['totalFrozen', overview.totalFrozen],
    ['totalSpent', overview.totalSpent],
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {metrics.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-3">
          <div className="text-xs text-[var(--glass-text-tertiary)]">{t(`metrics.${key}`)}</div>
          <div className="mt-1 truncate text-lg font-semibold text-[var(--glass-text-primary)]">{value}</div>
        </div>
      ))}
    </div>
  )
}

function UsersPanel({ users }: { users: AdminUsersResponse }) {
  const t = useTranslations('admin')

  return (
    <Section title={t('sections.users')}>
      {users.items.length === 0 ? <EmptyState label={t('empty')} /> : (
        <>
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>{t('fields.id')}</Th>
                  <Th>{t('fields.name')}</Th>
                  <Th>{t('fields.email')}</Th>
                  <Th>{t('fields.role')}</Th>
                  <Th>{t('fields.status')}</Th>
                  <Th>{t('fields.projects')}</Th>
                  <Th>{t('fields.tasks')}</Th>
                  <Th>{t('fields.balance')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {users.items.map((user: AdminUserSummary) => (
                  <tr key={user.id} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td><MonoCell value={user.id} /></Td>
                    <Td>{text(user.name)}</Td>
                    <Td><LongCell value={user.email} /></Td>
                    <Td><StatusPill value={user.role} /></Td>
                    <Td><StatusPill value={user.status} /></Td>
                    <Td>{user._count.projects}</Td>
                    <Td>{user._count.tasks}</Td>
                    <Td>{text(user.balance?.balance)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
          <PaginationNote total={users.total} page={users.page} pageSize={users.pageSize} />
        </>
      )}
    </Section>
  )
}

function BillingPanel({ billing }: { billing: AdminBillingResponse }) {
  const t = useTranslations('admin')
  const totals = [
    ['balance', billing.totals.balance],
    ['frozenAmount', billing.totals.frozenAmount],
    ['totalSpent', billing.totals.totalSpent],
  ] as const

  return (
    <div className="space-y-4">
      <Section title={t('sections.billingTotals')}>
        <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--glass-stroke-base)] md:grid-cols-3 md:divide-x md:divide-y-0">
          {totals.map(([key, value]) => (
            <div key={key} className="px-4 py-3">
              <div className="text-xs text-[var(--glass-text-tertiary)]">{t(`fields.${key}`)}</div>
              <div className="mt-1 text-base font-semibold text-[var(--glass-text-primary)]">{value}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('sections.recentTransactions')}>
        {billing.recentTransactions.items.length === 0 ? <EmptyState label={t('empty')} /> : (
          <>
            <TableShell>
              <DataTable>
                <thead>
                  <tr>
                    <Th>{t('fields.id')}</Th>
                    <Th>{t('fields.userId')}</Th>
                    <Th>{t('fields.type')}</Th>
                    <Th>{t('fields.amount')}</Th>
                    <Th>{t('fields.balanceAfter')}</Th>
                    <Th>{t('fields.description')}</Th>
                    <Th>{t('fields.createdAt')}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                  {billing.recentTransactions.items.map((transaction: AdminBillingTransaction) => (
                    <tr key={transaction.id} className="hover:bg-[var(--glass-bg-muted)]">
                      <Td><MonoCell value={transaction.id} /></Td>
                      <Td><MonoCell value={transaction.userId} /></Td>
                      <Td><StatusPill value={transaction.type} /></Td>
                      <Td>{transaction.amount}</Td>
                      <Td>{transaction.balanceAfter}</Td>
                      <Td><LongCell value={transaction.description} /></Td>
                      <Td>{formatDate(transaction.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableShell>
            <PaginationNote
              total={billing.recentTransactions.total}
              page={billing.recentTransactions.page}
              pageSize={billing.recentTransactions.pageSize}
            />
          </>
        )}
      </Section>
    </div>
  )
}

function TasksPanel({ tasks }: { tasks: AdminTasksResponse }) {
  const t = useTranslations('admin')

  return (
    <Section title={t('sections.tasks')}>
      {tasks.items.length === 0 ? <EmptyState label={t('empty')} /> : (
        <>
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>{t('fields.id')}</Th>
                  <Th>{t('fields.userId')}</Th>
                  <Th>{t('fields.projectId')}</Th>
                  <Th>{t('fields.type')}</Th>
                  <Th>{t('fields.status')}</Th>
                  <Th>{t('fields.progress')}</Th>
                  <Th>{t('fields.billingModel')}</Th>
                  <Th>{t('fields.hasPayload')}</Th>
                  <Th>{t('fields.hasResult')}</Th>
                  <Th>{t('fields.createdAt')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {tasks.items.map((task: AdminTaskSummary) => (
                  <tr key={task.id} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td><MonoCell value={task.id} /></Td>
                    <Td><MonoCell value={task.userId} /></Td>
                    <Td><MonoCell value={task.projectId} /></Td>
                    <Td>{task.type}</Td>
                    <Td><StatusPill value={task.status} /></Td>
                    <Td>{task.progress}%</Td>
                    <Td><LongCell value={task.billingModel} /></Td>
                    <Td>{task.hasPayload ? t('yes') : t('no')}</Td>
                    <Td>{task.hasResult ? t('yes') : t('no')}</Td>
                    <Td>{formatDate(task.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
          <PaginationNote total={tasks.total} page={tasks.page} pageSize={tasks.pageSize} />
        </>
      )}
    </Section>
  )
}

function ModelsPanel({ models }: { models: AdminModelsResponse }) {
  const t = useTranslations('admin')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t('sections.usageByModel')}>
        {models.usageByModel.length === 0 ? <EmptyState label={t('empty')} /> : (
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>{t('fields.apiType')}</Th>
                  <Th>{t('fields.model')}</Th>
                  <Th>{t('fields.cost')}</Th>
                  <Th>{t('fields.quantity')}</Th>
                  <Th>{t('fields.count')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {models.usageByModel.map(item => (
                  <tr key={`${item.apiType}:${item.model}`} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td>{item.apiType}</Td>
                    <Td><LongCell value={item.model} /></Td>
                    <Td>{item.cost}</Td>
                    <Td>{item.quantity}</Td>
                    <Td>{item.count}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
        )}
      </Section>

      <Section title={t('sections.taskHealthByType')}>
        {models.taskHealthByType.length === 0 ? <EmptyState label={t('empty')} /> : (
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>{t('fields.type')}</Th>
                  <Th>{t('fields.status')}</Th>
                  <Th>{t('fields.count')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {models.taskHealthByType.map(item => (
                  <tr key={`${item.type}:${item.status}`} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td>{item.type}</Td>
                    <Td><StatusPill value={item.status} /></Td>
                    <Td>{item.count}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
        )}
      </Section>
    </div>
  )
}

function SystemPanel({ system }: { system: AdminSystemHealthResponse }) {
  const t = useTranslations('admin')
  const checks = [
    ['database', system.database],
    ['logs', system.logs],
  ] as const

  return (
    <Section title={t('sections.systemHealth')}>
      <TableShell>
        <DataTable>
          <thead>
            <tr>
              <Th>{t('fields.type')}</Th>
              <Th>{t('fields.status')}</Th>
              <Th>{t('fields.message')}</Th>
              <Th>{t('fields.checkedAt')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--glass-stroke-base)]">
            {checks.map(([key, check]) => (
              <tr key={key} className="hover:bg-[var(--glass-bg-muted)]">
                <Td>{t(`fields.${key}`)}</Td>
                <Td><StatusPill value={check.status} /></Td>
                <Td><LongCell value={check.message} /></Td>
                <Td>{formatDate(system.checkedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableShell>
    </Section>
  )
}

function AuditPanel({ audit }: { audit: AdminAuditLogsResponse }) {
  const t = useTranslations('admin')

  return (
    <Section title={t('sections.auditLogs')}>
      {audit.items.length === 0 ? <EmptyState label={t('empty')} /> : (
        <>
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>{t('fields.action')}</Th>
                  <Th>{t('fields.actorRole')}</Th>
                  <Th>{t('fields.actorUserId')}</Th>
                  <Th>{t('fields.targetType')}</Th>
                  <Th>{t('fields.targetId')}</Th>
                  <Th>{t('fields.reason')}</Th>
                  <Th>{t('fields.createdAt')}</Th>
                  <Th>{t('fields.ip')}</Th>
                  <Th>{t('fields.userAgent')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {audit.items.map((item: AdminAuditLog) => (
                  <tr key={item.id} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td><StatusPill value={item.action} /></Td>
                    <Td>{item.actorRole}</Td>
                    <Td><MonoCell value={item.actorUserId} /></Td>
                    <Td>{item.targetType}</Td>
                    <Td><MonoCell value={item.targetId} /></Td>
                    <Td><LongCell value={item.reason} /></Td>
                    <Td>{formatDate(item.createdAt)}</Td>
                    <Td><MonoCell value={item.ip} /></Td>
                    <Td><LongCell value={item.userAgent} /></Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
          <PaginationNote total={audit.total} page={audit.page} pageSize={audit.pageSize} />
        </>
      )}
    </Section>
  )
}

export default function AdminConsoleClient() {
  const t = useTranslations('admin')
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [data, setData] = useState<AdminConsoleData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(false)

    try {
      const [overview, users, billing, tasks, models, system, audit] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminBilling(),
        fetchAdminTasks(),
        fetchAdminModels(),
        fetchAdminSystemHealth(),
        fetchAdminAuditLogs(),
      ])

      setData({ overview, users, billing, tasks, models, system, audit })
      setLastUpdated(new Date())
    } catch {
      setError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return t('neverUpdated')
    return t('lastUpdated', { time: lastUpdated.toLocaleString() })
  }, [lastUpdated, t])

  let content: React.ReactNode
  if (isLoading && !data) {
    content = <div className="py-16 text-center text-sm text-[var(--glass-text-tertiary)]">{t('loading')}</div>
  } else if (error || !data) {
    content = <div className="py-16 text-center text-sm text-[var(--glass-text-tertiary)]">{t('error')}</div>
  } else if (activeTab === 'overview') {
    content = <OverviewPanel overview={data.overview} />
  } else if (activeTab === 'users') {
    content = <UsersPanel users={data.users} />
  } else if (activeTab === 'billing') {
    content = <BillingPanel billing={data.billing} />
  } else if (activeTab === 'tasks') {
    content = <TasksPanel tasks={data.tasks} />
  } else if (activeTab === 'models') {
    content = <ModelsPanel models={data.models} />
  } else if (activeTab === 'system') {
    content = <SystemPanel system={data.system} />
  } else {
    content = <AuditPanel audit={data.audit} />
  }

  return (
    <div className="min-h-screen bg-[var(--glass-bg-canvas)] text-[var(--glass-text-primary)]">
      <Navbar />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-[var(--glass-stroke-base)] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--glass-text-primary)]">{t('title')}</h1>
            <p className="mt-1 text-sm text-[var(--glass-text-tertiary)]">{t('description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--glass-text-tertiary)]">
            <span>{lastUpdatedText}</span>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={isLoading}
              className="glass-btn-base glass-btn-secondary rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? t('refreshing') : t('refresh')}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="inline-flex min-w-full gap-1 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-1 md:min-w-0">
            {tabs.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-primary)]'
                    : 'text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-secondary)]'
                }`}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>
        </div>

        {content}
      </main>
    </div>
  )
}
