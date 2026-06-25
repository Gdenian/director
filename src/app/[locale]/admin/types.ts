export interface AdminOverviewResponse {
  totalUsers: number
  newUsersToday: number
  tasksToday: number
  failedTasks: number
  queuedTasks: number
  runningTasks: number
  usageCostToday: string
  totalBalance: string
  totalFrozen: string
  totalSpent: string
  actionItems?: AdminActionItem[]
}

export type AdminActionModule = 'featureFlags' | 'tasks' | 'billing' | 'models' | 'health' | 'announcements'

export interface AdminActionItem {
  id: string
  severity: 'info' | 'warning' | 'critical'
  module: AdminActionModule
  title: string
  action: string
  count?: number
}

export interface AdminOperationsResponse {
  announcements: {
    total: number
    published: number
  }
  featureFlags: {
    total: number
    disabled: number
  }
  userGroups: {
    total: number
    active: number
  }
  commercial: {
    packages: number
    redeemCodes: number
  }
  taskRisks?: {
    failed: number
    queued: number
    staleRunning: number
  }
  actionItems?: AdminActionItem[]
  checkedAt?: string
}

export interface AdminPagination {
  total: number
  page: number
  pageSize: number
}

export interface AdminUserSummary {
  id: string
  name: string | null
  email: string | null
  role: string
  status: string
  adminGroupKey: string | null
  adminNote: string | null
  sessionVersion: number
  createdAt: string
  updatedAt: string
  balance: null | {
    balance: string
    frozenAmount: string
    totalSpent: string
  }
  _count: {
    projects: number
    tasks: number
  }
}

export interface AdminUsersResponse extends AdminPagination {
  items: AdminUserSummary[]
}

export interface AdminBillingTransaction {
  id: string
  userId: string
  type: string
  amount: string
  balanceAfter: string
  description: string | null
  createdAt: string
  metadata?: Record<string, unknown> | null
}

export interface AdminBillingResponse {
  totals: {
    balance: string
    frozenAmount: string
    totalSpent: string
  }
  recentTransactions: AdminPagination & {
    items: AdminBillingTransaction[]
  }
  freezesByStatus: Array<{
    status: string
    amount: string
    count: number
  }>
}

export interface AdminTaskSummary {
  id: string
  userId: string | null
  projectId: string | null
  type: string
  status: string
  progress: number
  billingModel: string | null
  hasPayload: boolean
  hasResult: boolean
  createdAt: string
  updatedAt?: string
  errorMessage?: string | null
  lastEnqueueError?: string | null
}

export interface AdminTasksResponse extends AdminPagination {
  items: AdminTaskSummary[]
}

export interface AdminTaskIncidentItem {
  id: string
  incidentId: string
  taskId: string
  status: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminTaskIncident {
  id: string
  title: string
  action: string
  status: string
  reason: string
  filter: Record<string, unknown>
  createdBy: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
  counts: {
    total: number
    completed: number
    failed: number
  }
  items: AdminTaskIncidentItem[]
}

export interface AdminModelsResponse {
  usageByModel: Array<{
    apiType: string
    model: string
    cost: string
    quantity: number
    count: number
  }>
  taskHealthByType: Array<{
    type: string
    status: string
    count: number
  }>
}

export interface AdminHealthCheck {
  status: 'ok' | 'empty' | 'error' | 'warning' | 'critical' | 'stale' | 'missing_config' | string
  message?: string
  impact?: string
  details?: Record<string, unknown>
}

export interface AdminSystemHealthResponse {
  status?: 'ok' | 'warning' | 'critical' | string
  checks?: Record<string, AdminHealthCheck>
  impactedFeatures?: string[]
  recommendedActions?: string[]
  database: AdminHealthCheck
  logs: AdminHealthCheck
  checkedAt: string
}

export interface AdminAuditLog {
  id: string
  action: string
  actorRole: string
  actorUserId: string | null
  targetType: string
  targetId: string | null
  reason: string | null
  createdAt: string
  ip: string | null
  userAgent: string | null
  metadata?: Record<string, unknown> | null
}

export interface AdminAuditLogsResponse extends AdminPagination {
  items: AdminAuditLog[]
}

export interface AdminAnnouncement {
  id: string
  title: string
  body: string
  type: string
  severity: string
  status: string
  locale: string
  surface: string
  audience: string
  startsAt: string | null
  endsAt: string | null
  dismissible: boolean
  ctaLabel: string | null
  ctaHref: string | null
  groupKeys?: string | null
  targetUserIds?: string | null
  userMessage?: string | null
  impactSummary?: AdminImpactSummary
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminAnnouncementsResponse extends AdminPagination {
  items: AdminAnnouncement[]
}

export interface AdminFeatureFlag {
  key: string
  name: string
  description: string | null
  category: string
  enabled: boolean
  audience: string
  rolloutPercent: number
  startsAt: string | null
  endsAt: string | null
  userMessage?: string | null
  surfaces?: string | null
  groupKeys?: string | null
  ruleJson?: Record<string, unknown> | null
  impactSummary?: AdminImpactSummary
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminFeatureFlagsResponse {
  items: AdminFeatureFlag[]
}

export interface AdminUserGroup {
  key: string
  name: string
  description: string | null
  status: string
  priority: number
  signupCredits: string
  dailyTaskLimit: number | null
  concurrentTaskLimit: number | null
  monthlyCredits: string
  allowedModelTiers: string | null
  allowVideo: boolean
  allowVoice: boolean
  allowAdvancedModels: boolean
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminUserGroupsResponse {
  items: AdminUserGroup[]
}

export interface AdminCommercialPackage {
  key: string
  name: string
  description: string | null
  status: string
  price: string
  currency: string
  credits: string
  bonusCredits: string
  durationDays: number | null
  userGroupKey: string | null
  groupKeys: string | null
  startsAt: string | null
  endsAt: string | null
  purchaseLimitPerUser: number | null
  sortOrder: number
  impactSummary?: AdminImpactSummary
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminRedeemCode {
  code: string
  status: string
  credits: string
  maxRedemptions: number
  redeemedCount: number
  singleUserLimit: number
  startsAt: string | null
  endsAt: string | null
  userGroupKey: string | null
  groupKeys: string | null
  targetUserIds: string | null
  impactSummary?: AdminImpactSummary
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminCommercialResponse {
  packages: AdminCommercialPackage[]
  redeemCodes: AdminRedeemCode[]
}

export interface AdminImpactSummary {
  surfaces: string[]
  groupKeys: string[]
  targetUserCount: number
}
