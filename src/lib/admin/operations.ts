import { prisma } from '@/lib/prisma'
import { TASK_STATUS } from '@/lib/task/types'

type AdminActionModule = 'featureFlags' | 'tasks' | 'billing' | 'models' | 'health' | 'announcements'

type AdminActionItem = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  module: AdminActionModule
  title: string
  action: string
  count?: number
}

function actionItem(item: AdminActionItem) {
  return item
}

export async function getAdminOperations() {
  const staleHeartbeatBefore = new Date(Date.now() - 60 * 60 * 1000)
  const oldFreezeBefore = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    announcementTotal,
    publishedAnnouncements,
    publishedMaintenanceAnnouncements,
    totalFlags,
    disabledFlags,
    maintenanceEnabledFlags,
    totalGroups,
    activeGroups,
    packageCount,
    redeemCodeCount,
    failedTasks,
    queuedTasks,
    staleRunningTasks,
    pendingOldFreezes,
    disabledOrMaintenanceModelChannels,
    criticalHealthSnapshots,
  ] = await Promise.all([
    prisma.adminAnnouncement.count(),
    prisma.adminAnnouncement.count({ where: { status: 'published' } }),
    prisma.adminAnnouncement.count({ where: { status: 'published', type: 'maintenance' } }),
    prisma.adminFeatureFlag.count(),
    prisma.adminFeatureFlag.count({ where: { enabled: false } }),
    prisma.adminFeatureFlag.count({ where: { key: 'maintenance_mode', enabled: true } }),
    prisma.adminUserGroup.count(),
    prisma.adminUserGroup.count({ where: { status: 'active' } }),
    prisma.adminCommercialPackage.count(),
    prisma.adminRedeemCode.count(),
    prisma.task.count({ where: { status: TASK_STATUS.FAILED } }),
    prisma.task.count({ where: { status: TASK_STATUS.QUEUED } }),
    prisma.task.count({
      where: {
        status: TASK_STATUS.PROCESSING,
        OR: [
          { heartbeatAt: null },
          { heartbeatAt: { lt: staleHeartbeatBefore } },
        ],
      },
    }),
    prisma.balanceFreeze.count({
      where: {
        status: 'pending',
        OR: [
          { expiresAt: { lt: new Date() } },
          { createdAt: { lt: oldFreezeBefore } },
        ],
      },
    }),
    prisma.adminModelChannel.count({
      where: {
        status: { in: ['disabled', 'maintenance'] },
      },
    }),
    prisma.adminHealthCheckSnapshot.count({ where: { status: 'critical' } }),
  ])

  const actionItems = [
    ...(disabledFlags > 0 ? [actionItem({
      id: 'disabled-feature-flags',
      severity: 'warning',
      module: 'featureFlags',
      title: `${disabledFlags} 个功能开关已关闭`,
      action: '进入功能开关模块确认关闭范围、用户提示和恢复计划。',
      count: disabledFlags,
    })] : []),
    ...(staleRunningTasks > 0 ? [actionItem({
      id: 'stale-running-tasks',
      severity: 'critical',
      module: 'tasks',
      title: `${staleRunningTasks} 个运行任务疑似卡死`,
      action: '进入任务模块筛选运行中任务，按事故批次取消或重试。',
      count: staleRunningTasks,
    })] : []),
    ...(pendingOldFreezes > 0 ? [actionItem({
      id: 'pending-old-freezes',
      severity: 'warning',
      module: 'billing',
      title: `${pendingOldFreezes} 笔冻结待处理或已过期`,
      action: '进入计费模块核对冻结来源，释放确认无效的冻结。',
      count: pendingOldFreezes,
    })] : []),
    ...(disabledOrMaintenanceModelChannels > 0 ? [actionItem({
      id: 'disabled-maintenance-model-channels',
      severity: 'warning',
      module: 'models',
      title: `${disabledOrMaintenanceModelChannels} 个模型渠道不可用`,
      action: '进入模型模块检查渠道状态、默认模型和用户提示。',
      count: disabledOrMaintenanceModelChannels,
    })] : []),
    ...(criticalHealthSnapshots > 0 ? [actionItem({
      id: 'critical-health',
      severity: 'critical',
      module: 'health',
      title: '系统健康存在 critical 记录',
      action: '进入系统健康模块查看受影响能力并重新巡检。',
      count: criticalHealthSnapshots,
    })] : []),
    ...(maintenanceEnabledFlags > 0 && publishedMaintenanceAnnouncements === 0 ? [actionItem({
      id: 'maintenance-without-announcement',
      severity: 'warning',
      module: 'announcements',
      title: '维护模式缺少已发布维护公告',
      action: '进入公告模块发布 maintenance 类型公告，说明影响范围和恢复时间。',
      count: maintenanceEnabledFlags,
    })] : []),
  ]

  return {
    announcements: {
      total: announcementTotal,
      published: publishedAnnouncements,
    },
    featureFlags: {
      total: totalFlags,
      disabled: disabledFlags,
    },
    userGroups: {
      total: totalGroups,
      active: activeGroups,
    },
    commercial: {
      packages: packageCount,
      redeemCodes: redeemCodeCount,
    },
    taskRisks: {
      failed: failedTasks,
      queued: queuedTasks,
      staleRunning: staleRunningTasks,
    },
    actionItems,
    checkedAt: new Date().toISOString(),
  }
}
