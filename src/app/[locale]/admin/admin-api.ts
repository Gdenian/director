import type {
  AdminAuditLogsResponse,
  AdminBillingResponse,
  AdminModelsResponse,
  AdminOverviewResponse,
  AdminSystemHealthResponse,
  AdminTasksResponse,
  AdminUsersResponse,
} from './types'

async function fetchAdminJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Admin request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function fetchAdminOverview() {
  return fetchAdminJson<AdminOverviewResponse>('/api/admin/overview')
}

export function fetchAdminUsers() {
  return fetchAdminJson<AdminUsersResponse>('/api/admin/users')
}

export function fetchAdminBilling() {
  return fetchAdminJson<AdminBillingResponse>('/api/admin/billing')
}

export function fetchAdminTasks() {
  return fetchAdminJson<AdminTasksResponse>('/api/admin/tasks')
}

export function fetchAdminModels() {
  return fetchAdminJson<AdminModelsResponse>('/api/admin/models')
}

export function fetchAdminSystemHealth() {
  return fetchAdminJson<AdminSystemHealthResponse>('/api/admin/system-health')
}

export function fetchAdminAuditLogs() {
  return fetchAdminJson<AdminAuditLogsResponse>('/api/admin/audit-logs')
}
