import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { AdminConfirmDialog, AdminSelect, AdminStatusPill } from '@/app/[locale]/admin/admin-ui'
import {
  AdminUserFilterControls,
  AdminUserDetailDrawer,
  AdminUserNoteField,
  AdminUserOperationCells,
  AdminUsersPanel,
  SystemPanel,
  TasksPanel,
  applyUserFilterDraft,
  requestUserNoteUpdate,
  updateUserFilterDraft,
} from '@/app/[locale]/admin/AdminConsoleClient'

vi.mock('@/components/Navbar', () => ({ default: () => null }))
vi.mock('@/components/ui/icons', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    AppIcon: ({ name, className }: { name: string; className?: string }) => React.createElement('span', { className, 'data-icon': name }),
  }
})

describe('admin console ui primitives', () => {
  const sampleUser = {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'user',
    status: 'active',
    adminGroupKey: 'free',
    adminNote: '重点跟进',
    sessionVersion: 1,
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    balance: { balance: '10', frozenAmount: '2', totalSpent: '5' },
    _count: { projects: 1, tasks: 2 },
  }

  const sampleGroup = {
    key: 'free',
    name: '免费用户',
    description: null,
    status: 'active',
    priority: 1,
    signupCredits: '0',
    dailyTaskLimit: null,
    concurrentTaskLimit: null,
    monthlyCredits: '0',
    allowedModelTiers: null,
    allowVideo: true,
    allowVoice: true,
    allowAdvancedModels: false,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
  }

  type TestElement = ReactElement<Record<string, unknown>>

  function walkElements(node: unknown): TestElement[] {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(walkElements)
    if (!('props' in node)) return []
    const element = node as TestElement
    return [element, ...walkElements(element.props.children)]
  }

  it('renders readable select in dark admin surface', () => {
    const html = renderToStaticMarkup(
      createElement(AdminSelect, {
        label: '状态',
        value: 'active',
        onChange: () => undefined,
        options: [
          { value: 'active', label: '启用' },
          { value: 'paused', label: '暂停' },
        ],
      }),
    )

    expect(html).toContain('bg-white')
    expect(html).toContain('text-slate-950')
    expect(html).toContain('<option')
  })

  it('requires reason for destructive confirmation', () => {
    const html = renderToStaticMarkup(
      createElement(AdminConfirmDialog, {
        open: true,
        title: '取消任务',
        danger: true,
        reason: '',
        confirmLabel: '确认取消',
        onReasonChange: () => undefined,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    )

    expect(html).toContain('原因')
    expect(html).toContain('disabled')
  })

  it('renders status pills with consistent labels', () => {
    expect(renderToStaticMarkup(createElement(AdminStatusPill, { status: 'active' }))).toContain('active')
    expect(renderToStaticMarkup(createElement(AdminStatusPill, { status: 'paused' }))).toContain('paused')
    expect(renderToStaticMarkup(createElement(AdminStatusPill, { status: 'maintenance' }))).toContain('maintenance')
  })

  it('renders user operation controls for access, role, group, note, and session revoke', () => {
    const html = renderToStaticMarkup(
      createElement(AdminUserOperationCells, {
        user: {
          ...sampleUser,
        },
        busy: false,
        canManageRoles: true,
        onUserStatusRequest: () => undefined,
        onUserRoleRequest: () => undefined,
        onUserGroupRequest: () => undefined,
        onUserNoteRequest: () => undefined,
        onUserRevokeSessionRequest: () => undefined,
      }),
    )

    expect(html).toContain('禁用')
    expect(html).toContain('角色')
    expect(html).toContain('用户组')
    expect(html).toContain('备注')
    expect(html).toContain('踢出登录')
  })

  it('hides role dropdown for non-owner admins', () => {
    const html = renderToStaticMarkup(
      createElement(AdminUserOperationCells, {
        user: sampleUser,
        busy: false,
        canManageRoles: false,
        onUserStatusRequest: () => undefined,
        onUserRoleRequest: () => undefined,
        onUserGroupRequest: () => undefined,
        onUserNoteRequest: () => undefined,
        onUserRevokeSessionRequest: () => undefined,
      }),
    )

    expect(html).not.toContain('角色')
    expect(html).toContain('用户组')
  })

  it('renders user filters and safe detail metadata', () => {
    const html = renderToStaticMarkup(
      createElement(AdminUsersPanel, {
        users: { items: [sampleUser], total: 1, page: 1, pageSize: 20 },
        groups: {
          items: [sampleGroup],
        },
        busy: false,
        currentAdminRole: 'owner',
        filters: { search: '', role: '', status: '', group: '' },
        onApplyFilters: () => undefined,
        onUserStatusRequest: () => undefined,
        onUserRoleRequest: () => undefined,
        onUserGroupRequest: () => undefined,
        onUserNoteRequest: () => undefined,
        onUserRevokeSessionRequest: () => undefined,
      }),
    )

    expect(html).toContain('搜索用户')
    expect(html).toContain('角色筛选')
    expect(html).toContain('状态筛选')
    expect(html).toContain('用户组筛选')
    expect(html).toContain('查看')

    const drawerHtml = renderToStaticMarkup(
      createElement(AdminUserDetailDrawer, {
        user: sampleUser,
        onClose: () => undefined,
      }),
    )
    expect(drawerHtml).toContain('用户详情')
    expect(drawerHtml).toContain('作品数')
    expect(drawerHtml).toContain('任务数')
    expect(drawerHtml).toContain('余额')
    expect(drawerHtml).not.toContain('prompt')
  })

  it('keeps user filter edits local until apply is requested', () => {
    const apply = vi.fn()
    const initial = { search: '', role: '', status: '', group: '' }

    const draft = updateUserFilterDraft(initial, { search: 'alice' })

    expect(draft).toEqual({ search: 'alice', role: '', status: '', group: '' })
    expect(apply).not.toHaveBeenCalled()

    applyUserFilterDraft(draft, apply)

    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(draft)
  })

  it('updates user notes only through explicit save logic', () => {
    const requestNote = vi.fn()

    expect(requestNote).not.toHaveBeenCalled()
    requestUserNoteUpdate(sampleUser, '重点跟进', requestNote)
    expect(requestNote).not.toHaveBeenCalled()

    requestUserNoteUpdate(sampleUser, ' 新备注 ', requestNote)

    expect(requestNote).toHaveBeenCalledTimes(1)
    expect(requestNote).toHaveBeenCalledWith(sampleUser, '新备注')
  })

  it('filter controls call draft change on input and apply only on button click', () => {
    const onDraftChange = vi.fn()
    const onApply = vi.fn()
    const element = AdminUserFilterControls({
      groups: [sampleGroup],
      busy: false,
      filters: { search: '', role: '', status: '', group: '' },
      onDraftChange,
      onApply,
    })
    const elements = walkElements(element)
    const searchInput = elements.find(item => item.type === 'input' && item.props.placeholder === 'ID / 名称 / 邮箱')
    const applyButton = elements.find(item => item.props.children === '应用筛选' && typeof item.props.onClick === 'function')

    if (typeof searchInput?.props.onChange === 'function') {
      searchInput.props.onChange({ target: { value: 'alice' } })
    }

    expect(onDraftChange).toHaveBeenCalledWith({ search: 'alice', role: '', status: '', group: '' })
    expect(onApply).not.toHaveBeenCalled()

    if (typeof applyButton?.props.onClick === 'function') {
      applyButton.props.onClick()
    }

    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('note field does not submit on blur and saves only on button click', () => {
    const onDraftChange = vi.fn()
    const onSave = vi.fn()
    const element = AdminUserNoteField({
      disabled: false,
      noteDraft: '重点跟进',
      noteChanged: true,
      onDraftChange,
      onSave,
    })
    const elements = walkElements(element)
    const input = elements.find(item => item.type === 'input')
    const saveButton = elements.find(item => item.type === 'button' && item.props.children === '保存备注')

    expect(input?.props.onBlur).toBeUndefined()
    if (typeof input?.props.onChange === 'function') {
      input.props.onChange({ target: { value: '新备注' } })
    }
    expect(onDraftChange).toHaveBeenCalledWith('新备注')
    expect(onSave).not.toHaveBeenCalled()

    if (typeof saveButton?.props.onClick === 'function') {
      saveButton.props.onClick()
    }

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('renders system health controls, jump targets, and impact fallback', () => {
    const html = renderToStaticMarkup(
      createElement(SystemPanel, {
        system: {
          status: 'warning',
          checks: {
            redis: { status: 'ok' },
            payment: { status: 'missing_config', message: 'Payment provider is not configured' },
          },
          impactedFeatures: ['充值支付'],
          recommendedActions: ['检查支付渠道配置'],
          database: { status: 'ok' },
          logs: { status: 'ok' },
          checkedAt: '2026-06-24T00:00:00.000Z',
        },
        busy: false,
        onRunHealthCheck: () => undefined,
        onNavigate: () => undefined,
      }),
    )

    expect(html).toContain('记录巡检')
    expect(html).toContain('功能开关')
    expect(html).toContain('任务事故')
    expect(html).toContain('模型渠道')
    expect(html).toContain('计费')
    expect(html).toContain('任务提交、任务状态推送、队列调度')
    expect(html).toContain('充值、套餐购买、余额入账')
  })

  it('renders batch task incident controls without private task fields', () => {
    const freshDate = new Date().toISOString()
    const html = renderToStaticMarkup(
      createElement(TasksPanel, {
        tasks: {
          items: [{
            id: 'task-1',
            userId: 'user-1',
            projectId: 'project-1',
            type: 'video_panel',
            status: 'queued',
            progress: 0,
            billingModel: 'model-a',
            hasPayload: true,
            hasResult: false,
            createdAt: freshDate,
            updatedAt: freshDate,
          }],
          total: 1,
          page: 1,
          pageSize: 50,
        },
        busy: false,
        incident: {
          id: 'incident-1',
          title: '批量取消卡死任务',
          action: 'cancel',
          status: 'completed',
          reason: '队列事故',
          filter: { status: ['queued'] },
          createdBy: 'owner-1',
          completedAt: '2026-06-24T00:00:00.000Z',
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
          counts: { total: 1, completed: 1, failed: 0 },
          items: [{
            id: 'incident-item-1',
            incidentId: 'incident-1',
            taskId: 'task-1',
            status: 'completed',
            before: { id: 'task-1', status: 'queued', type: 'video_panel', hasPayload: true, hasResult: false },
            after: { id: 'task-1', status: 'canceled', type: 'video_panel', hasPayload: true, hasResult: false },
            errorMessage: null,
            createdAt: '2026-06-24T00:00:00.000Z',
            updatedAt: '2026-06-24T00:00:00.000Z',
          }],
        },
        onCancelRequest: () => undefined,
        onIncidentRequest: () => undefined,
      }),
    )

    expect(html).toContain('创建事故批次')
    expect(html).toContain('早于分钟')
    expect(html).toContain('当前页预览 0 条')
    expect(html).toContain('取消任务')
    expect(html).toContain('before')
    expect(html).toContain('after')
    expect(html).toContain('status:queued')
    expect(html).toContain('status:canceled')
    expect(html).not.toContain('payload')
    expect(html).not.toContain('result')
    expect(html).not.toContain('billingInfo')
  })
})
