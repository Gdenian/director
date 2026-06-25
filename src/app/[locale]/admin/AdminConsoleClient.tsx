'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Navbar from '@/components/Navbar'
import { AppIcon, type AppIconName } from '@/components/ui/icons'

import {
  cancelAdminTask,
  createAdminAnnouncement,
  createAdminCommercialPackage,
  createAdminRedeemCode,
  createAdminTaskIncident,
  createAdminUserGroup,
  fetchAdminAnnouncements,
  fetchAdminAuditLogs,
  fetchAdminBilling,
  fetchAdminCommercial,
  fetchAdminFeatureFlags,
  fetchAdminModels,
  fetchAdminOperations,
  fetchAdminOverview,
  fetchAdminSystemHealth,
  fetchAdminTasks,
  fetchAdminUserGroups,
  fetchAdminUsers,
  runAdminSystemHealthCheck,
  updateAdminAnnouncement,
  updateAdminCommercialPackage,
  updateAdminFeatureFlag,
  updateAdminRedeemCode,
  updateAdminUser,
  updateAdminUserGroup,
} from './admin-api'
import { AdminButton, AdminConfirmDialog, AdminSelect, adminInputClass } from './admin-ui'
import type {
  AdminAnnouncement,
  AdminAnnouncementsResponse,
  AdminAuditLog,
  AdminAuditLogsResponse,
  AdminBillingResponse,
  AdminBillingTransaction,
  AdminCommercialPackage,
  AdminCommercialResponse,
  AdminFeatureFlag,
  AdminFeatureFlagsResponse,
  AdminActionItem,
  AdminModelsResponse,
  AdminOperationsResponse,
  AdminOverviewResponse,
  AdminRedeemCode,
  AdminSystemHealthResponse,
  AdminTaskIncident,
  AdminTaskSummary,
  AdminTasksResponse,
  AdminUserGroup,
  AdminUserGroupsResponse,
  AdminUsersResponse,
  AdminUserSummary,
} from './types'

type AdminModule =
  | 'overview'
  | 'announcements'
  | 'flags'
  | 'users'
  | 'groups'
  | 'billing'
  | 'commercial'
  | 'models'
  | 'tasks'
  | 'system'
  | 'audit'

interface AdminConsoleData {
  overview: AdminOverviewResponse
  operations: AdminOperationsResponse
  announcements: AdminAnnouncementsResponse
  flags: AdminFeatureFlagsResponse
  users: AdminUsersResponse
  groups: AdminUserGroupsResponse
  billing: AdminBillingResponse
  commercial: AdminCommercialResponse
  tasks: AdminTasksResponse
  models: AdminModelsResponse
  system: AdminSystemHealthResponse
  audit: AdminAuditLogsResponse
}

type FieldValue = string | number | boolean | null
export type UserFilters = { search: string; role: string; status: string; group: string }

function actionModuleToAdminModule(module: string): AdminModule {
  if (module === 'featureFlags') return 'flags'
  if (module === 'health') return 'system'
  if (module === 'announcements'
    || module === 'flags'
    || module === 'billing'
    || module === 'models'
    || module === 'tasks'
    || module === 'system'
    || module === 'commercial'
    || module === 'users'
    || module === 'groups'
    || module === 'audit'
  ) return module
  return 'overview'
}

const taskIncidentInitialState = {
  title: '批量取消卡死任务',
  action: 'cancel',
  status: 'queued',
  type: '',
  userId: '',
  projectId: '',
  olderThanMinutes: '30',
  limit: '50',
  reason: '',
}

const modules: Array<{ key: AdminModule, label: string, icon: AppIconName }> = [
  { key: 'overview', label: '运营总览', icon: 'chart' },
  { key: 'announcements', label: '公告中心', icon: 'fileText' },
  { key: 'flags', label: '功能开关', icon: 'settingsHex' },
  { key: 'users', label: '用户运营', icon: 'usersRound' },
  { key: 'groups', label: '用户组与权益', icon: 'badgeCheck' },
  { key: 'billing', label: '计费与余额', icon: 'receipt' },
  { key: 'commercial', label: '套餐与兑换码', icon: 'package' },
  { key: 'models', label: '模型与渠道', icon: 'cpu' },
  { key: 'tasks', label: '任务事故', icon: 'clipboardCheck' },
  { key: 'system', label: '系统健康', icon: 'monitor' },
  { key: 'audit', label: '管理员审计', icon: 'clock' },
]

const announcementInitialState = {
  title: '',
  body: '',
  type: 'general',
  severity: 'info',
  status: 'draft',
  locale: 'all',
  surface: 'top_banner',
  audience: 'all',
  ctaLabel: '',
  ctaHref: '',
  reason: '',
}

const groupInitialState = {
  key: '',
  name: '',
  signupCredits: '0',
  dailyTaskLimit: '',
  concurrentTaskLimit: '',
  monthlyCredits: '0',
  allowVideo: false,
  allowVoice: false,
  allowAdvancedModels: false,
  reason: '',
}

const packageInitialState = {
  key: '',
  name: '',
  description: '',
  status: 'active',
  price: '0',
  currency: 'CNY',
  credits: '0',
  bonusCredits: '0',
  durationDays: '',
  userGroupKey: '',
  groupKeys: '',
  startsAt: '',
  endsAt: '',
  purchaseLimitPerUser: '',
  sortOrder: '100',
  reason: '',
}

const redeemInitialState = {
  code: '',
  status: 'active',
  credits: '0',
  maxRedemptions: '1',
  redeemedCount: '0',
  singleUserLimit: '1',
  startsAt: '',
  endsAt: '',
  userGroupKey: '',
  groupKeys: '',
  targetUserIds: '',
  reason: '',
}

type ConfirmAction =
  | { type: 'announcement-status', id: string, status: string, title: string }
  | { type: 'feature-flag-toggle', key: string, enabled: boolean, title: string }
  | { type: 'user-status', id: string, status: string, title: string }
  | { type: 'user-role', id: string, role: string, title: string }
  | { type: 'user-group', id: string, adminGroupKey: string | null, title: string }
  | { type: 'user-note', id: string, adminNote: string | null, title: string }
  | { type: 'user-session-revoke', id: string, title: string }
  | { type: 'group-status', key: string, status: string, title: string }
  | { type: 'package-status', key: string, status: string, title: string }
  | { type: 'redeem-status', code: string, status: string, title: string }
  | { type: 'task-cancel', id: string, title: string }
  | { type: 'task-incident-create', values: typeof taskIncidentInitialState, title: string }
  | { type: 'system-health-check', title: string }

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

function dateInputValue(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function toPayload(values: Record<string, FieldValue>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== ''),
  )
}

function omitPayloadFields(values: Record<string, unknown>, fields: string[]) {
  const payload = { ...values }
  fields.forEach(field => delete payload[field])
  return payload
}

function StatusPill({ value, tone = 'neutral' }: { value: string, tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  const className = {
    neutral: 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]',
    good: 'bg-emerald-500/10 text-emerald-300',
    warn: 'bg-amber-500/10 text-amber-300',
    danger: 'bg-red-500/10 text-red-300',
  }[tone]

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{value}</span>
}

function moduleTone(value: string) {
  if (['active', 'published', 'ok', 'enabled'].includes(value)) return 'good'
  if (['warning', 'scheduled', 'paused', 'queued', 'running', 'stale', 'empty', 'missing_config', 'degraded'].includes(value)) return 'warn'
  if (['critical', 'failed', 'disabled', 'error'].includes(value)) return 'danger'
  return 'neutral'
}

function Card({ title, action, children }: { title: string, action?: React.ReactNode, children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-stroke-base)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--glass-text-primary)]">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function MetricCard({ label, value, tone }: { label: string, value: string | number, tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  return (
    <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-3">
      <div className="text-xs text-[var(--glass-text-tertiary)]">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="truncate text-lg font-semibold text-[var(--glass-text-primary)]">{value}</div>
        {tone ? <StatusPill value={tone} tone={tone} /> : null}
      </div>
    </div>
  )
}

function EmptyState({ label = '暂无数据', description }: { label?: string, description?: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">
      <div>{label}</div>
      {description ? <div className="mt-1 text-xs">{description}</div> : null}
    </div>
  )
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

function DataTable({ children }: { children: React.ReactNode }) {
  return <table className="min-w-full divide-y divide-[var(--glass-stroke-base)] text-left text-xs">{children}</table>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 font-medium text-[var(--glass-text-tertiary)]">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-2 align-top text-[var(--glass-text-secondary)]">{children}</td>
}

function MonoCell({ value }: { value: string | null | undefined }) {
  return <span className="block max-w-[180px] truncate font-mono text-xs">{text(value)}</span>
}

function LongCell({ value }: { value: string | null | undefined }) {
  return <span className="block max-w-[320px] break-all text-xs leading-5">{text(value)}</span>
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <label className="block text-xs text-[var(--glass-text-tertiary)]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function inputClass() {
  return adminInputClass()
}

function ActionButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}) {
  return <AdminButton type={type} disabled={disabled} onClick={onClick}>{children}</AdminButton>
}

function userLabel(user: AdminUserSummary) {
  return user.name || user.email || user.id
}

function splitCsv(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function summarizeIncidentState(value: Record<string, unknown> | null) {
  if (!value) return '-'
  const parts = [
    typeof value.id === 'string' ? `id:${value.id}` : null,
    typeof value.status === 'string' ? `status:${value.status}` : null,
    typeof value.type === 'string' ? `type:${value.type}` : null,
    typeof value.hasPayload === 'boolean' ? `有输入:${value.hasPayload ? '是' : '否'}` : null,
    typeof value.hasResult === 'boolean' ? `有结果:${value.hasResult ? '是' : '否'}` : null,
    typeof value.billingModel === 'string' ? `model:${value.billingModel}` : null,
  ].filter(Boolean)
  return parts.join(' / ') || '-'
}

export function updateUserFilterDraft(filters: UserFilters, patch: Partial<UserFilters>) {
  return { ...filters, ...patch }
}

export function applyUserFilterDraft(filters: UserFilters, onApplyFilters: (filters: UserFilters) => void) {
  onApplyFilters(filters)
}

export function requestUserNoteUpdate(
  user: AdminUserSummary,
  noteDraft: string,
  onUserNoteRequest: (user: AdminUserSummary, adminNote: string | null) => void,
) {
  const normalizedNote = noteDraft.trim() || null
  if (normalizedNote !== (user.adminNote || null)) {
    onUserNoteRequest(user, normalizedNote)
  }
}

export function AdminUserNoteField({
  disabled,
  noteDraft,
  noteChanged,
  onDraftChange,
  onSave,
}: {
  disabled: boolean
  noteDraft: string
  noteChanged: boolean
  onDraftChange: (value: string) => void
  onSave: () => void
}) {
  return (
    <>
      <label className="grid min-w-40 gap-1 text-xs text-[var(--glass-text-tertiary)]">
        备注
        <input className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-950" value={noteDraft} disabled={disabled} onChange={event => onDraftChange(event.target.value)} />
      </label>
      <button type="button" className="text-xs font-medium text-amber-300 disabled:opacity-50" disabled={disabled || !noteChanged} onClick={onSave}>保存备注</button>
    </>
  )
}

export function AdminUserFilterControls({
  groups,
  busy,
  filters,
  onDraftChange,
  onApply,
}: {
  groups: AdminUserGroup[]
  busy: boolean
  filters: UserFilters
  onDraftChange: (filters: UserFilters) => void
  onApply: () => void
}) {
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-4">
      <Field label="搜索用户">
        <input
          className={inputClass()}
          value={filters.search}
          placeholder="ID / 名称 / 邮箱"
          onChange={event => onDraftChange(updateUserFilterDraft(filters, { search: event.target.value }))}
        />
      </Field>
      <AdminSelect
        label="角色筛选"
        value={filters.role}
        onChange={value => onDraftChange(updateUserFilterDraft(filters, { role: value }))}
        options={[
          { value: '', label: '全部角色' },
          { value: 'user', label: 'user' },
          { value: 'admin', label: 'admin' },
          { value: 'owner', label: 'owner' },
        ]}
      />
      <AdminSelect
        label="状态筛选"
        value={filters.status}
        onChange={value => onDraftChange(updateUserFilterDraft(filters, { status: value }))}
        options={[
          { value: '', label: '全部状态' },
          { value: 'active', label: 'active' },
          { value: 'disabled', label: 'disabled' },
        ]}
      />
      <AdminSelect
        label="用户组筛选"
        value={filters.group}
        onChange={value => onDraftChange(updateUserFilterDraft(filters, { group: value }))}
        options={[
          { value: '', label: '全部用户组' },
          { value: '__none', label: '未分配' },
          ...groups.map(group => ({ value: group.key, label: group.name || group.key })),
        ]}
      />
      <div className="flex items-end">
        <AdminButton type="button" disabled={busy} onClick={onApply}>应用筛选</AdminButton>
      </div>
    </div>
  )
}

function PaginationNote({ total, page, pageSize }: { total: number, page: number, pageSize: number }) {
  return <div className="border-t border-[var(--glass-stroke-base)] px-4 py-2 text-xs text-[var(--glass-text-tertiary)]">共 {total} 条，第 {page} 页，每页 {pageSize} 条</div>
}

function OverviewPanel({ data, onNavigate }: { data: AdminConsoleData, onNavigate: (module: AdminModule) => void }) {
  const taskRisks = data.operations.taskRisks
  const actionItems = [
    ...(data.operations.actionItems || []),
    ...(data.overview.actionItems || []),
  ]
  const metrics = [
    ['用户总数', data.overview.totalUsers],
    ['今日新用户', data.overview.newUsersToday],
    ['今日任务', data.overview.tasksToday],
    ['失败任务', data.overview.failedTasks, data.overview.failedTasks > 0 ? 'danger' : 'good'],
    ['排队中', data.overview.queuedTasks, data.overview.queuedTasks > 20 ? 'warn' : 'neutral'],
    ['运行中', data.overview.runningTasks],
    ['今日成本', data.overview.usageCostToday],
    ['平台余额', data.overview.totalBalance],
    ['已发布公告', data.operations.announcements.published],
    ['关闭开关', data.operations.featureFlags.disabled, data.operations.featureFlags.disabled > 0 ? 'warn' : 'good'],
  ] as const

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {metrics.map(([label, value, tone]) => (
          <MetricCard key={label} label={label} value={value} tone={tone as 'neutral' | 'good' | 'warn' | 'danger' | undefined} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="运营风险">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="失败任务" value={taskRisks?.failed ?? data.overview.failedTasks} tone={(taskRisks?.failed ?? 0) > 0 ? 'danger' : 'good'} />
            <MetricCard label="排队任务" value={taskRisks?.queued ?? data.overview.queuedTasks} tone={(taskRisks?.queued ?? 0) > 20 ? 'warn' : 'neutral'} />
            <MetricCard label="卡死运行" value={taskRisks?.staleRunning ?? 0} tone={(taskRisks?.staleRunning ?? 0) > 0 ? 'danger' : 'good'} />
          </div>
        </Card>
        <Card title="控制面状态">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="公告总数" value={data.operations.announcements.total} />
            <MetricCard label="功能开关" value={data.operations.featureFlags.total} />
            <MetricCard label="活跃用户组" value={data.operations.userGroups.active} />
            <MetricCard label="套餐 / 兑换码" value={`${data.operations.commercial.packages} / ${data.operations.commercial.redeemCodes}`} />
          </div>
        </Card>
      </div>

      <Card title="待处理动作">
        {actionItems.length === 0 ? (
          <EmptyState label="暂无待处理动作" description="当前没有需要运营介入的异常项。" />
        ) : (
          <div className="space-y-2">
            {actionItems.map((item: AdminActionItem) => {
              const targetModule = actionModuleToAdminModule(item.module)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(targetModule)}
                  className="flex w-full items-start justify-between gap-3 rounded-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-3 text-left transition hover:border-[var(--glass-stroke-strong)]"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusPill value={item.severity} tone={item.severity === 'critical' ? 'danger' : 'warn'} />
                      <span className="font-medium text-[var(--glass-text-primary)]">{item.title}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--glass-text-secondary)]">{item.action}</span>
                    {item.count !== undefined ? <span className="mt-1 block text-xs leading-5 text-[var(--glass-text-tertiary)]">影响数量：{item.count}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-sky-300">前往</span>
                </button>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function AnnouncementForm({ busy, onSubmit }: { busy: boolean, onSubmit: (values: typeof announcementInitialState) => Promise<void> }) {
  const [values, setValues] = useState(announcementInitialState)

  return (
    <form
      className="grid gap-3 lg:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault()
        await onSubmit(values)
        setValues(announcementInitialState)
      }}
    >
      <Field label="标题">
        <input className={inputClass()} value={values.title} onChange={event => setValues({ ...values, title: event.target.value })} />
      </Field>
      <Field label="类型">
        <AdminSelect label="类型" value={values.type} onChange={value => setValues({ ...values, type: value })} options={[
          { value: 'general', label: '普通' },
          { value: 'maintenance', label: '维护' },
          { value: 'incident', label: '故障' },
          { value: 'billing', label: '计费' },
          { value: 'release', label: '更新' },
          { value: 'campaign', label: '活动' },
        ]} />
      </Field>
      <Field label="级别">
        <AdminSelect label="级别" value={values.severity} onChange={value => setValues({ ...values, severity: value })} options={[
          { value: 'info', label: 'info' },
          { value: 'warning', label: 'warning' },
          { value: 'critical', label: 'critical' },
        ]} />
      </Field>
      <Field label="状态">
        <AdminSelect label="状态" value={values.status} onChange={value => setValues({ ...values, status: value })} options={[
          { value: 'draft', label: '草稿' },
          { value: 'scheduled', label: '定时' },
          { value: 'published', label: '发布' },
          { value: 'paused', label: '暂停' },
        ]} />
      </Field>
      <Field label="语言">
        <AdminSelect label="语言" value={values.locale} onChange={value => setValues({ ...values, locale: value })} options={[
          { value: 'all', label: '全部' },
          { value: 'zh', label: '中文' },
          { value: 'en', label: '英文' },
        ]} />
      </Field>
      <Field label="展示位">
        <AdminSelect label="展示位" value={values.surface} onChange={value => setValues({ ...values, surface: value })} options={[
          { value: 'top_banner', label: '顶部横幅' },
          { value: 'modal', label: '弹窗' },
          { value: 'workspace_notice', label: '工作区提示' },
          { value: 'profile_message', label: '个人中心消息' },
        ]} />
      </Field>
      <Field label="人群">
        <AdminSelect label="人群" value={values.audience} onChange={value => setValues({ ...values, audience: value })} options={[
          { value: 'all', label: '全部用户' },
          { value: 'admins', label: '管理员' },
          { value: 'test_users', label: '测试用户' },
          { value: 'vip', label: 'VIP' },
          { value: 'restricted', label: '受限用户' },
        ]} />
      </Field>
      <Field label="操作原因">
        <input className={inputClass()} value={values.reason} onChange={event => setValues({ ...values, reason: event.target.value })} />
      </Field>
      <div className="lg:col-span-2">
        <Field label="正文">
          <textarea className={`${inputClass()} min-h-24`} value={values.body} onChange={event => setValues({ ...values, body: event.target.value })} />
        </Field>
      </div>
      <Field label="按钮文案">
        <input className={inputClass()} value={values.ctaLabel} onChange={event => setValues({ ...values, ctaLabel: event.target.value })} />
      </Field>
      <Field label="按钮链接">
        <input className={inputClass()} value={values.ctaHref} onChange={event => setValues({ ...values, ctaHref: event.target.value })} />
      </Field>
      <div className="flex items-end">
        <ActionButton type="submit" disabled={busy}>发布配置</ActionButton>
      </div>
    </form>
  )
}

function AnnouncementsPanel({
  announcements,
  busy,
  onCreate,
  onStatusRequest,
}: {
  announcements: AdminAnnouncementsResponse
  busy: boolean
  onCreate: (values: typeof announcementInitialState) => Promise<void>
  onStatusRequest: (item: AdminAnnouncement, status: string) => void
}) {
  return (
    <div className="space-y-4">
      <Card title="新建公告">
        <AnnouncementForm busy={busy} onSubmit={onCreate} />
      </Card>
      <Card title="公告列表">
        {announcements.items.length === 0 ? <EmptyState /> : (
          <>
            <TableShell>
              <DataTable>
                <thead>
                  <tr>
                    <Th>标题</Th>
                    <Th>类型</Th>
                    <Th>级别</Th>
                    <Th>状态</Th>
                    <Th>语言</Th>
                    <Th>展示位</Th>
                    <Th>人群</Th>
                    <Th>更新</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                  {announcements.items.map((item: AdminAnnouncement) => (
                    <tr key={item.id} className="hover:bg-[var(--glass-bg-muted)]">
                      <Td><LongCell value={item.title} /></Td>
                      <Td><StatusPill value={item.type} /></Td>
                      <Td><StatusPill value={item.severity} tone={moduleTone(item.severity)} /></Td>
                      <Td><StatusPill value={item.status} tone={moduleTone(item.status)} /></Td>
                      <Td>{item.locale}</Td>
                      <Td>{item.surface}</Td>
                      <Td>{item.audience}</Td>
                      <Td>{formatDate(item.updatedAt)}</Td>
                      <Td>
                        <div className="flex gap-2">
                          <button className="text-xs font-medium text-emerald-300 disabled:opacity-50" disabled={busy} onClick={() => onStatusRequest(item, 'published')}>发布</button>
                          <button className="text-xs font-medium text-amber-300 disabled:opacity-50" disabled={busy} onClick={() => onStatusRequest(item, 'paused')}>暂停</button>
                          <button className="text-xs font-medium text-[var(--glass-text-tertiary)] disabled:opacity-50" disabled={busy} onClick={() => onStatusRequest(item, 'archived')}>归档</button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableShell>
            <PaginationNote total={announcements.total} page={announcements.page} pageSize={announcements.pageSize} />
          </>
        )}
      </Card>
    </div>
  )
}

function FlagsPanel({
  flags,
  busy,
  onToggleRequest,
}: {
  flags: AdminFeatureFlagsResponse
  busy: boolean
  onToggleRequest: (flag: AdminFeatureFlag) => void
}) {
  return (
    <Card title="功能开关">
      {flags.items.length === 0 ? <EmptyState /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {flags.items.map(flag => (
            <div key={flag.key} className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-[var(--glass-text-primary)]">{flag.name}</div>
                  <div className="mt-1 font-mono text-xs text-[var(--glass-text-tertiary)]">{flag.key}</div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggleRequest(flag)}
                  className="text-[var(--glass-text-secondary)] disabled:opacity-50"
                  title={flag.enabled ? '关闭' : '开启'}
                >
                  {flag.enabled ? <AppIcon name="check" className="h-6 w-6 text-emerald-300" /> : <AppIcon name="close" className="h-6 w-6 text-red-300" />}
                </button>
              </div>
              <p className="mt-3 min-h-10 text-xs leading-5 text-[var(--glass-text-tertiary)]">{flag.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill value={flag.enabled ? 'enabled' : 'disabled'} tone={flag.enabled ? 'good' : 'danger'} />
                <StatusPill value={flag.category} />
                <StatusPill value={`${flag.rolloutPercent}%`} />
                <StatusPill value={flag.audience} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function AdminUserOperationCells({
  user,
  busy,
  canManageRoles = false,
  groupOptions = [],
  onUserStatusRequest,
  onUserRoleRequest,
  onUserGroupRequest,
  onUserNoteRequest,
  onUserRevokeSessionRequest,
}: {
  user: AdminUserSummary
  busy: boolean
  canManageRoles?: boolean
  groupOptions?: AdminUserGroup[]
  onUserStatusRequest: (user: AdminUserSummary, status: string) => void
  onUserRoleRequest: (user: AdminUserSummary, role: string) => void
  onUserGroupRequest: (user: AdminUserSummary, adminGroupKey: string | null) => void
  onUserNoteRequest: (user: AdminUserSummary, adminNote: string | null) => void
  onUserRevokeSessionRequest: (user: AdminUserSummary) => void
}) {
  const [noteDraft, setNoteDraft] = useState(user.adminNote || '')
  const disabled = busy
  const normalizedNote = noteDraft.trim() || null
  const noteChanged = normalizedNote !== (user.adminNote || null)
  const requestNoteUpdate = () => {
    requestUserNoteUpdate(user, noteDraft, onUserNoteRequest)
  }

  return (
    <div className="flex min-w-[360px] flex-wrap items-end gap-2">
      {user.status === 'disabled' ? (
        <button type="button" className="text-xs font-medium text-emerald-300 disabled:opacity-50" disabled={disabled} onClick={() => onUserStatusRequest(user, 'active')}>恢复</button>
      ) : (
        <button type="button" className="text-xs font-medium text-red-300 disabled:opacity-50" disabled={disabled} onClick={() => onUserStatusRequest(user, 'disabled')}>禁用</button>
      )}
      {canManageRoles ? (
        <label className="grid gap-1 text-xs text-[var(--glass-text-tertiary)]">
          角色
          <select className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-950" value={user.role} disabled={disabled} onChange={event => onUserRoleRequest(user, event.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
        </label>
      ) : null}
      <label className="grid gap-1 text-xs text-[var(--glass-text-tertiary)]">
        用户组
        <select className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-950" value={user.adminGroupKey || ''} disabled={disabled} onChange={event => onUserGroupRequest(user, event.target.value || null)}>
          <option value="">未分配</option>
          {groupOptions.map(group => (
            <option key={group.key} value={group.key}>{group.name || group.key}</option>
          ))}
        </select>
      </label>
      <AdminUserNoteField
        disabled={disabled}
        noteDraft={noteDraft}
        noteChanged={noteChanged}
        onDraftChange={setNoteDraft}
        onSave={requestNoteUpdate}
      />
      <button type="button" className="text-xs font-medium text-red-300 disabled:opacity-50" disabled={disabled} onClick={() => onUserRevokeSessionRequest(user)}>踢出登录</button>
    </div>
  )
}

export function AdminUserDetailDrawer({
  user,
  onClose,
}: {
  user: AdminUserSummary
  onClose: () => void
}) {
  const rows = [
    ['用户 ID', user.id],
    ['名称', user.name],
    ['邮箱', user.email],
    ['角色', user.role],
    ['状态', user.status],
    ['用户组', user.adminGroupKey],
    ['会话版本', user.sessionVersion],
    ['作品数', user._count.projects],
    ['任务数', user._count.tasks],
    ['余额', user.balance?.balance],
    ['冻结金额', user.balance?.frozenAmount],
    ['累计消费', user.balance?.totalSpent],
    ['注册时间', formatDate(user.createdAt)],
    ['更新时间', formatDate(user.updatedAt)],
    ['管理员备注', user.adminNote],
  ] as const

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-stroke-base)] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">用户详情</h3>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{userLabel(user)}</p>
        </div>
        <button type="button" className="text-xs font-medium text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]" onClick={onClose}>关闭</button>
      </div>
      <dl className="mt-4 grid gap-3 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md bg-[var(--glass-bg-muted)] px-3 py-2">
            <dt className="text-[var(--glass-text-tertiary)]">{label}</dt>
            <dd className="mt-1 break-all text-[var(--glass-text-secondary)]">{text(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function AdminUsersPanel({
  users,
  groups,
  busy,
  currentAdminRole,
  filters,
  onApplyFilters,
  onUserStatusRequest,
  onUserRoleRequest,
  onUserGroupRequest,
  onUserNoteRequest,
  onUserRevokeSessionRequest,
}: {
  users: AdminUsersResponse
  groups: AdminUserGroupsResponse
  busy: boolean
  currentAdminRole: string
  filters: UserFilters
  onApplyFilters: (filters: UserFilters) => void
  onUserStatusRequest: (user: AdminUserSummary, status: string) => void
  onUserRoleRequest: (user: AdminUserSummary, role: string) => void
  onUserGroupRequest: (user: AdminUserSummary, adminGroupKey: string | null) => void
  onUserNoteRequest: (user: AdminUserSummary, adminNote: string | null) => void
  onUserRevokeSessionRequest: (user: AdminUserSummary) => void
}) {
  const activeGroups = groups.items.filter(group => group.status === 'active')
  const canManageRoles = currentAdminRole === 'owner'
  const [detailUser, setDetailUser] = useState<AdminUserSummary | null>(null)
  const [draftFilters, setDraftFilters] = useState(filters)
  const applyFilters = () => applyUserFilterDraft(draftFilters, onApplyFilters)
  const clearFilters = () => {
    const next = { search: '', role: '', status: '', group: '' }
    setDraftFilters(next)
    applyUserFilterDraft(next, onApplyFilters)
  }

  return (
    <Card
      title="用户运营"
      action={(
        <button
          type="button"
          className="text-xs font-medium text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]"
          onClick={clearFilters}
        >
          清除筛选
        </button>
      )}
    >
      <AdminUserFilterControls
        groups={groups.items}
        busy={busy}
        filters={draftFilters}
        onDraftChange={setDraftFilters}
        onApply={applyFilters}
      />
      {users.items.length === 0 ? <EmptyState /> : (
        <>
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>ID</Th>
                  <Th>名称</Th>
                  <Th>邮箱</Th>
                  <Th>角色</Th>
                  <Th>状态</Th>
                  <Th>用户组</Th>
                  <Th>备注</Th>
                  <Th>作品</Th>
                  <Th>任务</Th>
                  <Th>余额</Th>
                  <Th>冻结</Th>
                  <Th>消费</Th>
                  <Th>详情</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {users.items.map((user: AdminUserSummary) => (
                  <tr key={user.id} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td><MonoCell value={user.id} /></Td>
                    <Td>{text(user.name)}</Td>
                    <Td><LongCell value={user.email} /></Td>
                    <Td><StatusPill value={user.role} tone={moduleTone(user.role)} /></Td>
                    <Td><StatusPill value={user.status} tone={moduleTone(user.status)} /></Td>
                    <Td><MonoCell value={user.adminGroupKey} /></Td>
                    <Td><LongCell value={user.adminNote} /></Td>
                    <Td>{user._count.projects}</Td>
                    <Td>{user._count.tasks}</Td>
                    <Td>{text(user.balance?.balance)}</Td>
                    <Td>{text(user.balance?.frozenAmount)}</Td>
                    <Td>{text(user.balance?.totalSpent)}</Td>
                    <Td>
                      <button type="button" className="text-xs font-medium text-sky-300 disabled:opacity-50" disabled={busy} onClick={() => setDetailUser(user)}>查看</button>
                    </Td>
                    <Td>
                      <AdminUserOperationCells
                        user={user}
                        busy={busy}
                        canManageRoles={canManageRoles}
                        groupOptions={activeGroups}
                        onUserStatusRequest={onUserStatusRequest}
                        onUserRoleRequest={onUserRoleRequest}
                        onUserGroupRequest={onUserGroupRequest}
                        onUserNoteRequest={onUserNoteRequest}
                        onUserRevokeSessionRequest={onUserRevokeSessionRequest}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
          <PaginationNote total={users.total} page={users.page} pageSize={users.pageSize} />
        </>
      )}
      {detailUser ? <AdminUserDetailDrawer user={detailUser} onClose={() => setDetailUser(null)} /> : null}
    </Card>
  )
}

function GroupsPanel({
  groups,
  busy,
  onCreate,
  onStatusRequest,
}: {
  groups: AdminUserGroupsResponse
  busy: boolean
  onCreate: (values: typeof groupInitialState) => Promise<void>
  onStatusRequest: (group: AdminUserGroup, status: string) => void
}) {
  const [values, setValues] = useState(groupInitialState)

  return (
    <div className="space-y-4">
      <Card title="新建用户组">
        <form
          className="grid gap-3 lg:grid-cols-4"
          onSubmit={async (event) => {
            event.preventDefault()
            await onCreate(values)
            setValues(groupInitialState)
          }}
        >
          <Field label="Key"><input className={inputClass()} value={values.key} onChange={event => setValues({ ...values, key: event.target.value })} /></Field>
          <Field label="名称"><input className={inputClass()} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} /></Field>
          <Field label="注册送额度"><input className={inputClass()} value={values.signupCredits} onChange={event => setValues({ ...values, signupCredits: event.target.value })} /></Field>
          <Field label="月度额度"><input className={inputClass()} value={values.monthlyCredits} onChange={event => setValues({ ...values, monthlyCredits: event.target.value })} /></Field>
          <Field label="每日任务上限"><input className={inputClass()} value={values.dailyTaskLimit} onChange={event => setValues({ ...values, dailyTaskLimit: event.target.value })} /></Field>
          <Field label="并发上限"><input className={inputClass()} value={values.concurrentTaskLimit} onChange={event => setValues({ ...values, concurrentTaskLimit: event.target.value })} /></Field>
          <Field label="原因"><input className={inputClass()} value={values.reason} onChange={event => setValues({ ...values, reason: event.target.value })} /></Field>
          <div className="flex items-end gap-4 text-xs text-[var(--glass-text-secondary)]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={values.allowVideo} onChange={event => setValues({ ...values, allowVideo: event.target.checked })} />视频</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={values.allowVoice} onChange={event => setValues({ ...values, allowVoice: event.target.checked })} />语音</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={values.allowAdvancedModels} onChange={event => setValues({ ...values, allowAdvancedModels: event.target.checked })} />高级模型</label>
          </div>
          <div className="flex items-end">
            <ActionButton type="submit" disabled={busy}>创建用户组</ActionButton>
          </div>
        </form>
      </Card>
      <Card title="用户组列表">
        {groups.items.length === 0 ? <EmptyState /> : (
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>Key</Th>
                  <Th>名称</Th>
                  <Th>状态</Th>
                  <Th>注册送</Th>
                  <Th>月额度</Th>
                  <Th>每日任务</Th>
                  <Th>并发</Th>
                  <Th>视频</Th>
                  <Th>语音</Th>
                  <Th>高级模型</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {groups.items.map((group: AdminUserGroup) => (
                  <tr key={group.key} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td><MonoCell value={group.key} /></Td>
                    <Td>{group.name}</Td>
                    <Td><StatusPill value={group.status} tone={moduleTone(group.status)} /></Td>
                    <Td>{group.signupCredits}</Td>
                    <Td>{group.monthlyCredits}</Td>
                    <Td>{text(group.dailyTaskLimit)}</Td>
                    <Td>{text(group.concurrentTaskLimit)}</Td>
                    <Td>{group.allowVideo ? '是' : '否'}</Td>
                    <Td>{group.allowVoice ? '是' : '否'}</Td>
                    <Td>{group.allowAdvancedModels ? '是' : '否'}</Td>
                    <Td>
                      {group.status === 'active' ? (
                        <button className="text-xs font-medium text-amber-300 disabled:opacity-50" disabled={busy} onClick={() => onStatusRequest(group, 'paused')}>暂停</button>
                      ) : (
                        <button className="text-xs font-medium text-emerald-300 disabled:opacity-50" disabled={busy} onClick={() => onStatusRequest(group, 'active')}>启用</button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
        )}
      </Card>
    </div>
  )
}

function BillingPanel({ billing }: { billing: AdminBillingResponse }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="平台余额" value={billing.totals.balance} />
        <MetricCard label="冻结金额" value={billing.totals.frozenAmount} tone={Number(billing.totals.frozenAmount) > 0 ? 'warn' : 'neutral'} />
        <MetricCard label="累计消费" value={billing.totals.totalSpent} />
      </div>
      <Card title="最近交易">
        {billing.recentTransactions.items.length === 0 ? <EmptyState /> : (
          <>
            <TableShell>
              <DataTable>
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>用户</Th>
                    <Th>类型</Th>
                    <Th>金额</Th>
                    <Th>余额</Th>
                    <Th>说明</Th>
                    <Th>时间</Th>
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
            <PaginationNote total={billing.recentTransactions.total} page={billing.recentTransactions.page} pageSize={billing.recentTransactions.pageSize} />
          </>
        )}
      </Card>
    </div>
  )
}

function CommercialPanel({
  commercial,
  busy,
  onCreatePackage,
  onCreateRedeem,
  onUpdatePackage,
  onUpdateRedeem,
  onPackageStatusRequest,
  onRedeemStatusRequest,
}: {
  commercial: AdminCommercialResponse
  busy: boolean
  onCreatePackage: (values: typeof packageInitialState) => Promise<boolean>
  onCreateRedeem: (values: typeof redeemInitialState) => Promise<boolean>
  onUpdatePackage: (key: string, values: typeof packageInitialState) => Promise<boolean>
  onUpdateRedeem: (code: string, values: typeof redeemInitialState) => Promise<boolean>
  onPackageStatusRequest: (item: AdminCommercialPackage, status: string) => void
  onRedeemStatusRequest: (item: AdminRedeemCode, status: string) => void
}) {
  const [packageValues, setPackageValues] = useState(packageInitialState)
  const [redeemValues, setRedeemValues] = useState(redeemInitialState)
  const [editingPackageKey, setEditingPackageKey] = useState<string | null>(null)
  const [editingRedeemCode, setEditingRedeemCode] = useState<string | null>(null)

  const loadPackageForm = (item: AdminCommercialPackage, mode: 'edit' | 'copy') => {
    setEditingPackageKey(mode === 'edit' ? item.key : null)
    setPackageValues({
      key: mode === 'copy' ? `${item.key}_copy` : item.key,
      name: mode === 'copy' ? `${item.name} Copy` : item.name,
      description: item.description || '',
      status: item.status,
      price: item.price,
      currency: item.currency,
      credits: item.credits,
      bonusCredits: item.bonusCredits,
      durationDays: item.durationDays === null ? '' : String(item.durationDays),
      userGroupKey: item.userGroupKey || '',
      groupKeys: item.groupKeys || '',
      startsAt: dateInputValue(item.startsAt),
      endsAt: dateInputValue(item.endsAt),
      purchaseLimitPerUser: item.purchaseLimitPerUser === null ? '' : String(item.purchaseLimitPerUser),
      sortOrder: String(item.sortOrder),
      reason: '',
    })
  }

  const loadRedeemForm = (item: AdminRedeemCode, mode: 'edit' | 'copy') => {
    setEditingRedeemCode(mode === 'edit' ? item.code : null)
    setRedeemValues({
      code: mode === 'copy' ? `${item.code}_COPY` : item.code,
      status: item.status,
      credits: item.credits,
      maxRedemptions: String(item.maxRedemptions),
      redeemedCount: String(item.redeemedCount),
      singleUserLimit: String(item.singleUserLimit),
      startsAt: dateInputValue(item.startsAt),
      endsAt: dateInputValue(item.endsAt),
      userGroupKey: item.userGroupKey || '',
      groupKeys: item.groupKeys || '',
      targetUserIds: item.targetUserIds || '',
      reason: '',
    })
  }

  const resetPackageForm = () => {
    setEditingPackageKey(null)
    setPackageValues(packageInitialState)
  }

  const resetRedeemForm = () => {
    setEditingRedeemCode(null)
    setRedeemValues(redeemInitialState)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={editingPackageKey ? `编辑套餐 ${editingPackageKey}` : '新建套餐'}>
          <form
            className="grid gap-3 md:grid-cols-2"
	            onSubmit={async (event) => {
	              event.preventDefault()
	              const succeeded = editingPackageKey
	                ? await onUpdatePackage(editingPackageKey, packageValues)
	                : await onCreatePackage(packageValues)
	              if (succeeded) resetPackageForm()
	            }}
          >
            <Field label="Key"><input className={inputClass()} value={packageValues.key} onChange={event => setPackageValues({ ...packageValues, key: event.target.value })} /></Field>
            <Field label="名称"><input className={inputClass()} value={packageValues.name} onChange={event => setPackageValues({ ...packageValues, name: event.target.value })} /></Field>
            {editingPackageKey ? (
              <Field label="状态"><StatusPill value={packageValues.status} tone={moduleTone(packageValues.status)} /></Field>
            ) : (
              <AdminSelect
                label="状态"
                value={packageValues.status}
                onChange={value => setPackageValues({ ...packageValues, status: value })}
                options={[
                  { value: 'active', label: 'active' },
                  { value: 'paused', label: 'paused' },
                  { value: 'archived', label: 'archived' },
                ]}
              />
            )}
            <Field label="价格"><input className={inputClass()} value={packageValues.price} onChange={event => setPackageValues({ ...packageValues, price: event.target.value })} /></Field>
            <Field label="币种"><input className={inputClass()} value={packageValues.currency} onChange={event => setPackageValues({ ...packageValues, currency: event.target.value })} /></Field>
            <Field label="额度"><input className={inputClass()} value={packageValues.credits} onChange={event => setPackageValues({ ...packageValues, credits: event.target.value })} /></Field>
            <Field label="赠送"><input className={inputClass()} value={packageValues.bonusCredits} onChange={event => setPackageValues({ ...packageValues, bonusCredits: event.target.value })} /></Field>
            <Field label="有效天数"><input className={inputClass()} value={packageValues.durationDays} onChange={event => setPackageValues({ ...packageValues, durationDays: event.target.value })} /></Field>
            <Field label="用户组"><input className={inputClass()} value={packageValues.userGroupKey} onChange={event => setPackageValues({ ...packageValues, userGroupKey: event.target.value })} /></Field>
            <Field label="用户组列表"><input className={inputClass()} value={packageValues.groupKeys} onChange={event => setPackageValues({ ...packageValues, groupKeys: event.target.value })} /></Field>
            <Field label="开始时间"><input type="datetime-local" className={inputClass()} value={packageValues.startsAt} onChange={event => setPackageValues({ ...packageValues, startsAt: event.target.value })} /></Field>
            <Field label="结束时间"><input type="datetime-local" className={inputClass()} value={packageValues.endsAt} onChange={event => setPackageValues({ ...packageValues, endsAt: event.target.value })} /></Field>
            <Field label="每人限购"><input className={inputClass()} value={packageValues.purchaseLimitPerUser} onChange={event => setPackageValues({ ...packageValues, purchaseLimitPerUser: event.target.value })} /></Field>
            <Field label="排序"><input className={inputClass()} value={packageValues.sortOrder} onChange={event => setPackageValues({ ...packageValues, sortOrder: event.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="说明"><input className={inputClass()} value={packageValues.description} onChange={event => setPackageValues({ ...packageValues, description: event.target.value })} /></Field></div>
            <div className="md:col-span-2"><Field label="原因"><input className={inputClass()} value={packageValues.reason} onChange={event => setPackageValues({ ...packageValues, reason: event.target.value })} /></Field></div>
            <div className="flex gap-2">
              <AdminButton type="submit" disabled={busy}>{editingPackageKey ? '保存套餐' : '创建套餐'}</AdminButton>
              {editingPackageKey ? <AdminButton secondary disabled={busy} onClick={resetPackageForm}>取消</AdminButton> : null}
            </div>
          </form>
        </Card>
        <Card title={editingRedeemCode ? `编辑兑换码 ${editingRedeemCode}` : '新建兑换码'}>
          <form
            className="grid gap-3 md:grid-cols-2"
	            onSubmit={async (event) => {
	              event.preventDefault()
	              const succeeded = editingRedeemCode
	                ? await onUpdateRedeem(editingRedeemCode, redeemValues)
	                : await onCreateRedeem(redeemValues)
	              if (succeeded) resetRedeemForm()
	            }}
          >
            <Field label="兑换码"><input className={inputClass()} value={redeemValues.code} onChange={event => setRedeemValues({ ...redeemValues, code: event.target.value })} /></Field>
            {editingRedeemCode ? (
              <Field label="状态"><StatusPill value={redeemValues.status} tone={moduleTone(redeemValues.status)} /></Field>
            ) : (
              <AdminSelect
                label="状态"
                value={redeemValues.status}
                onChange={value => setRedeemValues({ ...redeemValues, status: value })}
                options={[
                  { value: 'active', label: 'active' },
                  { value: 'paused', label: 'paused' },
                  { value: 'archived', label: 'archived' },
                ]}
              />
            )}
            <Field label="额度"><input className={inputClass()} value={redeemValues.credits} onChange={event => setRedeemValues({ ...redeemValues, credits: event.target.value })} /></Field>
            <Field label="可用次数"><input className={inputClass()} value={redeemValues.maxRedemptions} onChange={event => setRedeemValues({ ...redeemValues, maxRedemptions: event.target.value })} /></Field>
            <Field label="已兑换"><input className={inputClass()} value={redeemValues.redeemedCount} onChange={event => setRedeemValues({ ...redeemValues, redeemedCount: event.target.value })} /></Field>
            <Field label="单用户上限"><input className={inputClass()} value={redeemValues.singleUserLimit} onChange={event => setRedeemValues({ ...redeemValues, singleUserLimit: event.target.value })} /></Field>
            <Field label="开始时间"><input type="datetime-local" className={inputClass()} value={redeemValues.startsAt} onChange={event => setRedeemValues({ ...redeemValues, startsAt: event.target.value })} /></Field>
            <Field label="结束时间"><input type="datetime-local" className={inputClass()} value={redeemValues.endsAt} onChange={event => setRedeemValues({ ...redeemValues, endsAt: event.target.value })} /></Field>
            <Field label="用户组"><input className={inputClass()} value={redeemValues.userGroupKey} onChange={event => setRedeemValues({ ...redeemValues, userGroupKey: event.target.value })} /></Field>
            <Field label="用户组列表"><input className={inputClass()} value={redeemValues.groupKeys} onChange={event => setRedeemValues({ ...redeemValues, groupKeys: event.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="目标用户"><input className={inputClass()} value={redeemValues.targetUserIds} onChange={event => setRedeemValues({ ...redeemValues, targetUserIds: event.target.value })} /></Field></div>
            <div className="md:col-span-2"><Field label="原因"><input className={inputClass()} value={redeemValues.reason} onChange={event => setRedeemValues({ ...redeemValues, reason: event.target.value })} /></Field></div>
            <div className="flex gap-2">
              <AdminButton type="submit" disabled={busy}>{editingRedeemCode ? '保存兑换码' : '创建兑换码'}</AdminButton>
              {editingRedeemCode ? <AdminButton secondary disabled={busy} onClick={resetRedeemForm}>取消</AdminButton> : null}
            </div>
          </form>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="套餐列表">
          {commercial.packages.length === 0 ? <EmptyState /> : (
            <TableShell>
              <DataTable>
                <thead>
                  <tr>
                    <Th>Key</Th>
                    <Th>名称</Th>
                    <Th>状态</Th>
                    <Th>价格</Th>
                    <Th>额度</Th>
                    <Th>赠送</Th>
                    <Th>用户组</Th>
                    <Th>时间窗</Th>
                    <Th>限购</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                  {commercial.packages.map((item: AdminCommercialPackage) => (
                    <tr key={item.key} className="hover:bg-[var(--glass-bg-muted)]">
                      <Td><MonoCell value={item.key} /></Td>
                      <Td>{item.name}</Td>
                      <Td><StatusPill value={item.status} tone={moduleTone(item.status)} /></Td>
                      <Td>{item.price} {item.currency}</Td>
                      <Td>{item.credits}</Td>
                      <Td>{item.bonusCredits}</Td>
                      <Td><LongCell value={item.groupKeys || item.userGroupKey} /></Td>
                      <Td>{formatDate(item.startsAt)} 至 {formatDate(item.endsAt)}</Td>
                      <Td>{text(item.purchaseLimitPerUser)}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <button className="text-xs font-medium text-sky-300 disabled:opacity-50" disabled={busy} onClick={() => loadPackageForm(item, 'edit')}>编辑</button>
                          <button className="text-xs font-medium text-slate-300 disabled:opacity-50" disabled={busy} onClick={() => loadPackageForm(item, 'copy')}>复制</button>
                          {item.status === 'active' ? (
                            <button className="text-xs font-medium text-amber-300 disabled:opacity-50" disabled={busy} onClick={() => onPackageStatusRequest(item, 'paused')}>暂停</button>
                          ) : (
                            <button className="text-xs font-medium text-emerald-300 disabled:opacity-50" disabled={busy} onClick={() => onPackageStatusRequest(item, 'active')}>发布</button>
                          )}
                          {item.status !== 'archived' ? (
                            <button className="text-xs font-medium text-red-300 disabled:opacity-50" disabled={busy} onClick={() => onPackageStatusRequest(item, 'archived')}>归档</button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableShell>
          )}
        </Card>
        <Card title="兑换码列表">
          {commercial.redeemCodes.length === 0 ? <EmptyState /> : (
            <TableShell>
              <DataTable>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>状态</Th>
                    <Th>额度</Th>
                    <Th>已用 / 上限</Th>
                    <Th>单用户</Th>
                    <Th>用户组</Th>
                    <Th>时间窗</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                  {commercial.redeemCodes.map((item: AdminRedeemCode) => (
                    <tr key={item.code} className="hover:bg-[var(--glass-bg-muted)]">
                      <Td><MonoCell value={item.code} /></Td>
                      <Td><StatusPill value={item.status} tone={moduleTone(item.status)} /></Td>
                      <Td>{item.credits}</Td>
                      <Td>{item.redeemedCount} / {item.maxRedemptions}</Td>
                      <Td>{item.singleUserLimit}</Td>
                      <Td><LongCell value={item.targetUserIds || item.groupKeys || item.userGroupKey} /></Td>
                      <Td>{formatDate(item.startsAt)} 至 {formatDate(item.endsAt)}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <button className="text-xs font-medium text-sky-300 disabled:opacity-50" disabled={busy} onClick={() => loadRedeemForm(item, 'edit')}>编辑</button>
                          <button className="text-xs font-medium text-slate-300 disabled:opacity-50" disabled={busy} onClick={() => loadRedeemForm(item, 'copy')}>复制</button>
                          {item.status === 'active' ? (
                            <button className="text-xs font-medium text-amber-300 disabled:opacity-50" disabled={busy} onClick={() => onRedeemStatusRequest(item, 'paused')}>暂停</button>
                          ) : (
                            <button className="text-xs font-medium text-emerald-300 disabled:opacity-50" disabled={busy} onClick={() => onRedeemStatusRequest(item, 'active')}>启用</button>
                          )}
                          {item.status !== 'archived' ? (
                            <button className="text-xs font-medium text-red-300 disabled:opacity-50" disabled={busy} onClick={() => onRedeemStatusRequest(item, 'archived')}>归档</button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableShell>
          )}
        </Card>
      </div>
    </div>
  )
}

function ModelsPanel({ models }: { models: AdminModelsResponse }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="模型用量">
        {models.usageByModel.length === 0 ? <EmptyState /> : (
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>API</Th>
                  <Th>模型</Th>
                  <Th>成本</Th>
                  <Th>数量</Th>
                  <Th>次数</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {models.usageByModel.map(item => (
                  <tr key={`${item.apiType}-${item.model}`} className="hover:bg-[var(--glass-bg-muted)]">
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
      </Card>
      <Card title="任务健康度">
        {models.taskHealthByType.length === 0 ? <EmptyState /> : (
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>类型</Th>
                  <Th>状态</Th>
                  <Th>数量</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {models.taskHealthByType.map(item => (
                  <tr key={`${item.type}-${item.status}`} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td>{item.type}</Td>
                    <Td><StatusPill value={item.status} tone={moduleTone(item.status)} /></Td>
                    <Td>{item.count}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
        )}
      </Card>
    </div>
  )
}

export function TasksPanel({
  tasks,
  busy,
  incident,
  onCancelRequest,
  onIncidentRequest,
}: {
  tasks: AdminTasksResponse
  busy: boolean
  incident: AdminTaskIncident | null
  onCancelRequest: (task: AdminTaskSummary) => void
  onIncidentRequest: (values: typeof taskIncidentInitialState) => void
}) {
  const [values, setValues] = useState(taskIncidentInitialState)

  const statuses = splitCsv(values.status)
  const types = splitCsv(values.type)
  const olderThanMinutes = Number(values.olderThanMinutes)
  const olderThanCutoff = Number.isFinite(olderThanMinutes) && olderThanMinutes > 0
    ? Date.now() - Math.floor(olderThanMinutes) * 60_000
    : null
  const previewCount = tasks.items.filter(task => (
    (!statuses.length || statuses.includes(task.status))
    && (!types.length || types.includes(task.type))
    && (!values.userId.trim() || task.userId === values.userId.trim())
    && (!values.projectId.trim() || task.projectId === values.projectId.trim())
    && (olderThanCutoff === null || new Date(task.updatedAt || task.createdAt).getTime() < olderThanCutoff)
  )).length
  const hasEffectiveFilter = Boolean(
    statuses.length
    || types.length
    || values.userId.trim()
    || values.projectId.trim()
    || values.olderThanMinutes.trim()
  )

  return (
    <Card title="任务事故">
      <div className="mb-4 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-3">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="标题"><input className={inputClass()} value={values.title} onChange={event => setValues({ ...values, title: event.target.value })} /></Field>
          <Field label="动作">
            <select className={inputClass()} value={values.action} onChange={event => setValues({ ...values, action: event.target.value })}>
              <option value="cancel">取消任务</option>
            </select>
          </Field>
          <Field label="状态"><input className={inputClass()} value={values.status} onChange={event => setValues({ ...values, status: event.target.value })} placeholder="queued" /></Field>
          <Field label="类型"><input className={inputClass()} value={values.type} onChange={event => setValues({ ...values, type: event.target.value })} placeholder="video_panel" /></Field>
          <Field label="用户 ID"><input className={inputClass()} value={values.userId} onChange={event => setValues({ ...values, userId: event.target.value })} /></Field>
          <Field label="作品 ID"><input className={inputClass()} value={values.projectId} onChange={event => setValues({ ...values, projectId: event.target.value })} /></Field>
          <Field label="早于分钟"><input className={inputClass()} value={values.olderThanMinutes} onChange={event => setValues({ ...values, olderThanMinutes: event.target.value })} inputMode="numeric" /></Field>
          <Field label="上限"><input className={inputClass()} value={values.limit} onChange={event => setValues({ ...values, limit: event.target.value })} inputMode="numeric" /></Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--glass-text-secondary)]">
            当前页预览 {previewCount} 条；最终批量范围以服务端筛选为准
          </div>
          <ActionButton disabled={busy || !values.title.trim() || !hasEffectiveFilter} onClick={() => onIncidentRequest(values)}>创建事故批次</ActionButton>
        </div>
      </div>
      {incident ? (
        <div className="mb-4 rounded-lg border border-[var(--glass-stroke-base)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-[var(--glass-text-primary)]">{incident.title}</span>
            <StatusPill value={incident.status} tone={moduleTone(incident.status)} />
            <span className="text-[var(--glass-text-secondary)]">总数 {incident.counts.total}</span>
            <span className="text-[var(--glass-text-secondary)]">完成 {incident.counts.completed}</span>
            <span className="text-[var(--glass-text-secondary)]">失败 {incident.counts.failed}</span>
          </div>
          {incident.items.length ? (
            <div className="mt-3 grid gap-2">
              {incident.items.slice(0, 8).map(item => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 text-xs text-[var(--glass-text-secondary)]">
                  <MonoCell value={item.taskId} />
                  <StatusPill value={item.status} tone={moduleTone(item.status)} />
                  <LongCell value={`before ${summarizeIncidentState(item.before)}`} />
                  <LongCell value={`after ${summarizeIncidentState(item.after)}`} />
                  {item.errorMessage ? <LongCell value={item.errorMessage} /> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {tasks.items.length === 0 ? <EmptyState /> : (
        <>
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>ID</Th>
                  <Th>用户</Th>
                  <Th>作品</Th>
                  <Th>类型</Th>
                  <Th>状态</Th>
                  <Th>进度</Th>
                  <Th>计费模型</Th>
                  <Th>创建</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {tasks.items.map((task: AdminTaskSummary) => (
                  <tr key={task.id} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td><MonoCell value={task.id} /></Td>
                    <Td><MonoCell value={task.userId} /></Td>
                    <Td><MonoCell value={task.projectId} /></Td>
                    <Td>{task.type}</Td>
                    <Td><StatusPill value={task.status} tone={moduleTone(task.status)} /></Td>
                    <Td>{task.progress}%</Td>
                    <Td><LongCell value={task.billingModel} /></Td>
                    <Td>{formatDate(task.createdAt)}</Td>
                    <Td>
                      {task.status === 'queued' || task.status === 'processing' ? (
                        <button className="text-xs font-medium text-red-300 disabled:opacity-50" disabled={busy} onClick={() => onCancelRequest(task)}>取消</button>
                      ) : (
                        <span className="text-xs text-[var(--glass-text-tertiary)]">-</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
          <PaginationNote total={tasks.total} page={tasks.page} pageSize={tasks.pageSize} />
        </>
      )}
    </Card>
  )
}

const healthImpactFallback: Record<string, string> = {
  database: '管理后台、任务提交、用户登录态相关查询',
  redis: '任务提交、任务状态推送、队列调度',
  bullmq: '任务排队、异步生成、批量任务恢复',
  worker: '文本、图片、视频、配音生成处理',
  minio: '素材上传、预览、成片和资产存储',
  payment: '充值、套餐购买、余额入账',
  modelChannels: '模型选择、任务提交、生成链路',
  logs: '故障排查、审计辅助、运维定位',
}

const healthJumpTargets: Array<{ module: AdminModule, label: string, icon: AppIconName }> = [
  { module: 'flags', label: '功能开关', icon: 'settingsHex' },
  { module: 'tasks', label: '任务事故', icon: 'clipboardCheck' },
  { module: 'models', label: '模型渠道', icon: 'cpu' },
  { module: 'billing', label: '计费', icon: 'receipt' },
]

export function SystemPanel({
  system,
  busy,
  onRunHealthCheck,
  onNavigate,
}: {
  system: AdminSystemHealthResponse
  busy: boolean
  onRunHealthCheck: () => void
  onNavigate: (module: AdminModule) => void
}) {
  const checks = system.checks || {
    database: system.database,
    logs: system.logs,
  }
  const checkEntries = Object.entries(checks)
  const overallStatus = system.status || (checkEntries.some(([, check]) => check.status === 'error' || check.status === 'critical') ? 'critical' : 'ok')
  const impactedFeatures = system.impactedFeatures || []
  const recommendedActions = system.recommendedActions || []

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="总状态" value={overallStatus} tone={moduleTone(overallStatus) as 'neutral' | 'good' | 'warn' | 'danger'} />
        <MetricCard label="检查项" value={checkEntries.length} />
        <MetricCard label="受影响功能" value={impactedFeatures.length} tone={impactedFeatures.length > 0 ? 'warn' : 'good'} />
        <MetricCard label="检查时间" value={formatDate(system.checkedAt)} />
      </div>

      <Card
        title="依赖检查"
        action={(
          <button
            type="button"
            disabled={busy}
            onClick={onRunHealthCheck}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--glass-stroke-base)] px-2.5 py-1.5 text-xs font-medium text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] disabled:opacity-50"
          >
            <AppIcon name="refresh" className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            记录巡检
          </button>
        )}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {healthJumpTargets.map(target => (
            <button
              key={target.module}
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--glass-bg-muted)] px-2.5 py-1.5 text-xs font-medium text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]"
              onClick={() => onNavigate(target.module)}
            >
              <AppIcon name={target.icon} className="h-3.5 w-3.5" />
              {target.label}
            </button>
          ))}
        </div>
        <TableShell>
          <DataTable>
            <thead>
              <tr>
                <Th>模块</Th>
                <Th>状态</Th>
                <Th>影响</Th>
                <Th>说明</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--glass-stroke-base)]">
              {checkEntries.map(([key, check]) => (
                <tr key={key} className="hover:bg-[var(--glass-bg-muted)]">
                  <Td>{key}</Td>
                  <Td><StatusPill value={check.status} tone={moduleTone(check.status)} /></Td>
                  <Td><LongCell value={check.impact || healthImpactFallback[key]} /></Td>
                  <Td><LongCell value={check.message} /></Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableShell>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="影响范围">
          {impactedFeatures.length === 0 ? <EmptyState label="暂无受影响功能" /> : (
            <div className="flex flex-wrap gap-2">
              {impactedFeatures.map(feature => <StatusPill key={feature} value={feature} tone="warn" />)}
            </div>
          )}
        </Card>
        <Card title="建议操作">
          {recommendedActions.length === 0 ? <EmptyState label="暂无建议操作" /> : (
            <div className="space-y-2">
              {recommendedActions.map(action => (
                <div key={action} className="rounded-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                  {action}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function AuditPanel({ audit }: { audit: AdminAuditLogsResponse }) {
  return (
    <Card title="管理员审计">
      {audit.items.length === 0 ? <EmptyState /> : (
        <>
          <TableShell>
            <DataTable>
              <thead>
                <tr>
                  <Th>动作</Th>
                  <Th>操作者</Th>
                  <Th>角色</Th>
                  <Th>目标</Th>
                  <Th>原因</Th>
                  <Th>IP</Th>
                  <Th>时间</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--glass-stroke-base)]">
                {audit.items.map((item: AdminAuditLog) => (
                  <tr key={item.id} className="hover:bg-[var(--glass-bg-muted)]">
                    <Td><StatusPill value={item.action} /></Td>
                    <Td><MonoCell value={item.actorUserId} /></Td>
                    <Td>{item.actorRole}</Td>
                    <Td>{item.targetType}:{text(item.targetId)}</Td>
                    <Td><LongCell value={item.reason} /></Td>
                    <Td>{text(item.ip)}</Td>
                    <Td>{formatDate(item.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableShell>
          <PaginationNote total={audit.total} page={audit.page} pageSize={audit.pageSize} />
        </>
      )}
    </Card>
  )
}

function renderModule(
  activeModule: AdminModule,
  data: AdminConsoleData,
  busy: boolean,
  currentAdminRole: string,
  userFilters: UserFilters,
  latestTaskIncident: AdminTaskIncident | null,
  onUserFiltersChange: (filters: UserFilters) => void,
  handlers: {
    createAnnouncement: (values: typeof announcementInitialState) => Promise<void>
    requestAnnouncementStatus: (item: AdminAnnouncement, status: string) => void
    requestFlagToggle: (flag: AdminFeatureFlag) => void
    requestUserStatus: (user: AdminUserSummary, status: string) => void
    requestUserRole: (user: AdminUserSummary, role: string) => void
    requestUserGroup: (user: AdminUserSummary, adminGroupKey: string | null) => void
    requestUserNote: (user: AdminUserSummary, adminNote: string | null) => void
    requestUserRevokeSession: (user: AdminUserSummary) => void
    createGroup: (values: typeof groupInitialState) => Promise<void>
    requestGroupStatus: (group: AdminUserGroup, status: string) => void
    createPackage: (values: typeof packageInitialState) => Promise<boolean>
    createRedeem: (values: typeof redeemInitialState) => Promise<boolean>
    updatePackage: (key: string, values: typeof packageInitialState) => Promise<boolean>
    updateRedeem: (code: string, values: typeof redeemInitialState) => Promise<boolean>
    requestPackageStatus: (item: AdminCommercialPackage, status: string) => void
    requestRedeemStatus: (item: AdminRedeemCode, status: string) => void
    requestTaskCancel: (task: AdminTaskSummary) => void
    requestTaskIncident: (values: typeof taskIncidentInitialState) => void
    requestSystemHealthCheck: () => void
    navigateModule: (module: AdminModule) => void
  },
) {
  switch (activeModule) {
    case 'announcements':
      return <AnnouncementsPanel announcements={data.announcements} busy={busy} onCreate={handlers.createAnnouncement} onStatusRequest={handlers.requestAnnouncementStatus} />
    case 'flags':
      return <FlagsPanel flags={data.flags} busy={busy} onToggleRequest={handlers.requestFlagToggle} />
    case 'users':
      return (
        <AdminUsersPanel
          users={data.users}
          groups={data.groups}
          busy={busy}
          currentAdminRole={currentAdminRole}
          filters={userFilters}
          onApplyFilters={onUserFiltersChange}
          onUserStatusRequest={handlers.requestUserStatus}
          onUserRoleRequest={handlers.requestUserRole}
          onUserGroupRequest={handlers.requestUserGroup}
          onUserNoteRequest={handlers.requestUserNote}
          onUserRevokeSessionRequest={handlers.requestUserRevokeSession}
        />
      )
    case 'groups':
      return <GroupsPanel groups={data.groups} busy={busy} onCreate={handlers.createGroup} onStatusRequest={handlers.requestGroupStatus} />
    case 'billing':
      return <BillingPanel billing={data.billing} />
    case 'commercial':
      return <CommercialPanel commercial={data.commercial} busy={busy} onCreatePackage={handlers.createPackage} onCreateRedeem={handlers.createRedeem} onUpdatePackage={handlers.updatePackage} onUpdateRedeem={handlers.updateRedeem} onPackageStatusRequest={handlers.requestPackageStatus} onRedeemStatusRequest={handlers.requestRedeemStatus} />
    case 'models':
      return <ModelsPanel models={data.models} />
    case 'tasks':
      return <TasksPanel tasks={data.tasks} busy={busy} incident={latestTaskIncident} onCancelRequest={handlers.requestTaskCancel} onIncidentRequest={handlers.requestTaskIncident} />
    case 'system':
      return <SystemPanel system={data.system} busy={busy} onRunHealthCheck={handlers.requestSystemHealthCheck} onNavigate={handlers.navigateModule} />
    case 'audit':
      return <AuditPanel audit={data.audit} />
    case 'overview':
    default:
      return <OverviewPanel data={data} onNavigate={handlers.navigateModule} />
  }
}

interface AdminConsoleClientProps {
  currentAdminRole?: string
}

export default function AdminConsoleClient({ currentAdminRole = 'admin' }: AdminConsoleClientProps) {
  const [activeModule, setActiveModule] = useState<AdminModule>('overview')
  const [data, setData] = useState<AdminConsoleData | null>(null)
  const [userFilters, setUserFilters] = useState<UserFilters>({ search: '', role: '', status: '', group: '' })
  const userFiltersRef = useRef<UserFilters>(userFilters)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmReason, setConfirmReason] = useState('')
  const [latestTaskIncident, setLatestTaskIncident] = useState<AdminTaskIncident | null>(null)

  const loadData = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [
        overview,
        operations,
        announcements,
        flags,
        users,
        groups,
        billing,
        commercial,
        tasks,
        models,
        system,
        audit,
      ] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminOperations(),
        fetchAdminAnnouncements(),
        fetchAdminFeatureFlags(),
        fetchAdminUsers(userFiltersRef.current),
        fetchAdminUserGroups(),
        fetchAdminBilling(),
        fetchAdminCommercial(),
        fetchAdminTasks(),
        fetchAdminModels(),
        fetchAdminSystemHealth(),
        fetchAdminAuditLogs(),
      ])
      setData({ overview, operations, announcements, flags, users, groups, billing, commercial, tasks, models, system, audit })
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理端数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const refreshUsers = useCallback(async (filters: UserFilters) => {
    setBusy(true)
    setError(null)
    try {
      const users = await fetchAdminUsers(filters)
      setData(previous => previous ? { ...previous, users } : previous)
      setLastUpdated(new Date())
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '用户列表加载失败')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const applyUserFilters = useCallback((filters: UserFilters) => {
    userFiltersRef.current = filters
    setUserFilters(filters)
    void refreshUsers(filters)
  }, [refreshUsers])

  const runMutation = useCallback(async (operation: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await operation()
      await loadData()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
      return false
    } finally {
      setBusy(false)
    }
  }, [loadData])

  const handlers = useMemo(() => ({
    createAnnouncement: async (values: typeof announcementInitialState) => { await runMutation(() => createAdminAnnouncement(toPayload(values))) },
    requestAnnouncementStatus: (item: AdminAnnouncement, status: string) => setConfirmAction({ type: 'announcement-status', id: item.id, status, title: `将公告「${item.title}」改为 ${status}` }),
    requestFlagToggle: (flag: AdminFeatureFlag) => setConfirmAction({ type: 'feature-flag-toggle', key: flag.key, enabled: !flag.enabled, title: `${flag.enabled ? '关闭' : '开启'}功能开关「${flag.name}」` }),
    requestUserStatus: (user: AdminUserSummary, status: string) => setConfirmAction({ type: 'user-status', id: user.id, status, title: `将用户 ${userLabel(user)} 状态改为 ${status}` }),
    requestUserRole: (user: AdminUserSummary, role: string) => setConfirmAction({ type: 'user-role', id: user.id, role, title: `将用户 ${userLabel(user)} 角色改为 ${role}` }),
    requestUserGroup: (user: AdminUserSummary, adminGroupKey: string | null) => setConfirmAction({ type: 'user-group', id: user.id, adminGroupKey, title: `将用户 ${userLabel(user)} 用户组改为 ${adminGroupKey || '未分配'}` }),
    requestUserNote: (user: AdminUserSummary, adminNote: string | null) => setConfirmAction({ type: 'user-note', id: user.id, adminNote, title: `更新用户 ${userLabel(user)} 备注` }),
    requestUserRevokeSession: (user: AdminUserSummary) => setConfirmAction({ type: 'user-session-revoke', id: user.id, title: `踢出用户 ${userLabel(user)} 的当前登录` }),
    createGroup: async (values: typeof groupInitialState) => { await runMutation(() => createAdminUserGroup(toPayload(values))) },
    requestGroupStatus: (group: AdminUserGroup, status: string) => setConfirmAction({ type: 'group-status', key: group.key, status, title: `将用户组「${group.name}」改为 ${status}` }),
    createPackage: async (values: typeof packageInitialState) => runMutation(() => createAdminCommercialPackage(toPayload(values))),
    createRedeem: async (values: typeof redeemInitialState) => runMutation(() => createAdminRedeemCode(toPayload(values))),
    updatePackage: async (key: string, values: typeof packageInitialState) => runMutation(() => updateAdminCommercialPackage(key, omitPayloadFields(toPayload(values), ['key', 'status']))),
    updateRedeem: async (code: string, values: typeof redeemInitialState) => runMutation(() => updateAdminRedeemCode(code, omitPayloadFields(toPayload(values), ['code', 'status']))),
    requestPackageStatus: (item: AdminCommercialPackage, status: string) => setConfirmAction({ type: 'package-status', key: item.key, status, title: `将套餐「${item.name}」改为 ${status}` }),
    requestRedeemStatus: (item: AdminRedeemCode, status: string) => setConfirmAction({ type: 'redeem-status', code: item.code, status, title: `将兑换码 ${item.code} 改为 ${status}` }),
    requestTaskCancel: (task: AdminTaskSummary) => setConfirmAction({ type: 'task-cancel', id: task.id, title: `取消任务 ${task.id}` }),
    requestTaskIncident: (values: typeof taskIncidentInitialState) => setConfirmAction({ type: 'task-incident-create', values, title: `创建事故批次「${values.title.trim()}」` }),
    requestSystemHealthCheck: () => setConfirmAction({ type: 'system-health-check', title: '记录一次系统健康巡检' }),
    navigateModule: (module: AdminModule) => setActiveModule(module),
  }), [runMutation])

  const createTaskIncidentFromValues = useCallback(async (values: typeof taskIncidentInitialState, reason: string) => {
    let incident: AdminTaskIncident | null = null
    const filter = {
      ...(values.status.trim() ? { status: splitCsv(values.status) } : {}),
      ...(values.type.trim() ? { type: splitCsv(values.type) } : {}),
      ...(values.userId.trim() ? { userId: values.userId.trim() } : {}),
      ...(values.projectId.trim() ? { projectId: values.projectId.trim() } : {}),
      ...(values.olderThanMinutes.trim() ? { olderThanMinutes: Number(values.olderThanMinutes) } : {}),
      ...(values.limit.trim() ? { limit: Number(values.limit) } : {}),
    }
    const ok = await runMutation(async () => {
      incident = await createAdminTaskIncident({
        title: values.title.trim(),
        action: 'cancel',
        reason,
        filter,
      })
    })
    if (ok && incident) setLatestTaskIncident(incident)
    return ok ? incident : null
  }, [runMutation])

  const closeConfirm = useCallback(() => {
    setConfirmAction(null)
    setConfirmReason('')
  }, [])

  const runConfirmedAction = useCallback(async () => {
    const action = confirmAction
    const reason = confirmReason.trim()
    if (!action || reason.length < 3) return

    await runMutation(async () => {
      switch (action.type) {
        case 'announcement-status':
          return await updateAdminAnnouncement(action.id, { status: action.status, reason })
        case 'feature-flag-toggle':
          return await updateAdminFeatureFlag(action.key, { enabled: action.enabled, reason })
        case 'user-status':
          return await updateAdminUser(action.id, { status: action.status, reason })
        case 'user-role':
          return await updateAdminUser(action.id, { role: action.role, reason })
        case 'user-group':
          return await updateAdminUser(action.id, { adminGroupKey: action.adminGroupKey, reason })
        case 'user-note':
          return await updateAdminUser(action.id, { adminNote: action.adminNote, reason })
        case 'user-session-revoke':
          return await updateAdminUser(action.id, { revokeSession: true, reason })
        case 'group-status':
          return await updateAdminUserGroup(action.key, { status: action.status, reason })
        case 'package-status':
          return await updateAdminCommercialPackage(action.key, { status: action.status, reason })
        case 'redeem-status':
          return await updateAdminRedeemCode(action.code, { status: action.status, reason })
        case 'task-cancel':
          return await cancelAdminTask(action.id, { reason })
        case 'task-incident-create':
          return await createTaskIncidentFromValues(action.values, reason)
        case 'system-health-check':
          return await runAdminSystemHealthCheck({ reason })
      }
    })
    closeConfirm()
  }, [closeConfirm, confirmAction, confirmReason, createTaskIncidentFromValues, runMutation])

  const activeLabel = modules.find(item => item.key === activeModule)?.label || '运营总览'
  const disabledFlags = data?.operations.featureFlags.disabled ?? 0
  const failedTasks = data?.operations.taskRisks?.failed ?? data?.overview.failedTasks ?? 0
  const staleRunning = data?.operations.taskRisks?.staleRunning ?? 0

  return (
    <div className="min-h-screen bg-[var(--glass-bg-base)] text-[var(--glass-text-primary)]">
      <Navbar />
      <main className="mx-auto flex w-full max-w-[1680px] gap-4 px-4 py-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-4 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-2">
            {modules.map((item) => {
              const active = item.key === activeModule
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveModule(item.key)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${active ? 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)]'}`}
                >
                  <AppIcon name={item.icon} className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-4">
          <header className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--glass-text-tertiary)]">Admin Operations</p>
                <h1 className="mt-1 text-2xl font-semibold text-[var(--glass-text-primary)]">{activeLabel}</h1>
                <p className="mt-1 text-sm text-[var(--glass-text-secondary)]">运营网站运行规则、公告、资源、计费、模型渠道、任务事故和系统健康。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--glass-text-tertiary)]">{lastUpdated ? `最后更新：${lastUpdated.toLocaleString()}` : '尚未更新'}</span>
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading || busy}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--glass-stroke-base)] px-3 py-2 text-xs font-medium text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-muted)] disabled:opacity-50"
                >
                  <AppIcon name="refresh" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <div className="flex items-center gap-2 rounded-md bg-[var(--glass-bg-muted)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                <AppIcon name="alert" className={`h-4 w-4 ${failedTasks > 0 ? 'text-red-300' : 'text-emerald-300'}`} />
                失败任务 {failedTasks}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-[var(--glass-bg-muted)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                <AppIcon name="settingsHex" className={`h-4 w-4 ${disabledFlags > 0 ? 'text-amber-300' : 'text-emerald-300'}`} />
                已关闭开关 {disabledFlags}
              </div>
              <div className="flex items-center gap-2 rounded-md bg-[var(--glass-bg-muted)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]">
                <AppIcon name="clipboardCheck" className={`h-4 w-4 ${staleRunning > 0 ? 'text-red-300' : 'text-emerald-300'}`} />
                卡死运行 {staleRunning}
              </div>
            </div>
          </header>

          <div className="lg:hidden">
            <AdminSelect
              label="模块"
              value={activeModule}
              onChange={value => setActiveModule(value as AdminModule)}
              options={modules.map(item => ({ value: item.key, label: item.label }))}
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          ) : null}

          {loading && !data ? (
            <div className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-16 text-center text-sm text-[var(--glass-text-tertiary)]">加载中...</div>
          ) : data ? (
            renderModule(activeModule, data, busy, currentAdminRole, userFilters, latestTaskIncident, applyUserFilters, handlers)
          ) : null}
        </section>
      </main>
      <AdminConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ''}
        danger={confirmAction?.type === 'task-cancel' || confirmAction?.type === 'task-incident-create' || confirmAction?.type === 'user-status' || confirmAction?.type === 'user-session-revoke' || confirmAction?.type === 'feature-flag-toggle'}
        reason={confirmReason}
        confirmLabel="确认执行"
        onReasonChange={setConfirmReason}
        onCancel={closeConfirm}
        onConfirm={() => { void runConfirmedAction() }}
      />
    </div>
  )
}
