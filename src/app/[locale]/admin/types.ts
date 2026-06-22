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
  status: 'ok' | 'empty' | 'error' | string
  message?: string
}

export interface AdminSystemHealthResponse {
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
