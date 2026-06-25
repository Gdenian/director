import type {
  AdminAuditLogsResponse,
  AdminAnnouncementsResponse,
  AdminBillingResponse,
  AdminCommercialResponse,
  AdminFeatureFlagsResponse,
  AdminModelsResponse,
  AdminOperationsResponse,
  AdminOverviewResponse,
  AdminSystemHealthResponse,
  AdminTaskIncident,
  AdminTasksResponse,
  AdminUserGroupsResponse,
  AdminUsersResponse,
} from './types'

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    method: init?.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
    body: init?.body,
  })

  if (!response.ok) {
    throw new Error(await readAdminError(response))
  }

  return response.json() as Promise<T>
}

async function readAdminError(response: Response) {
  const body = await response.json().catch(() => null)
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) return error
    if (error && typeof error === 'object') {
      const nested = (error as { message?: unknown }).message
      if (typeof nested === 'string' && nested.trim()) return nested
    }
  }
  return `Admin request failed: ${response.status}`
}

function fetchAdminJson<T>(path: string): Promise<T> {
  return adminJson<T>(path)
}

function mutateAdminJson<T>(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<T> {
  return adminJson<T>(path, {
    method,
    body: JSON.stringify(body),
  })
}

export function fetchAdminOverview() {
  return fetchAdminJson<AdminOverviewResponse>('/api/admin/overview')
}

export function fetchAdminOperations() {
  return fetchAdminJson<AdminOperationsResponse>('/api/admin/operations')
}

export function fetchAdminAnnouncements() {
  return fetchAdminJson<AdminAnnouncementsResponse>('/api/admin/announcements')
}

export function createAdminAnnouncement(body: Record<string, unknown>) {
  return mutateAdminJson('/api/admin/announcements', 'POST', body)
}

export function updateAdminAnnouncement(announcementId: string, body: Record<string, unknown>) {
  return mutateAdminJson(`/api/admin/announcements/${encodeURIComponent(announcementId)}`, 'PATCH', body)
}

export function fetchAdminFeatureFlags() {
  return fetchAdminJson<AdminFeatureFlagsResponse>('/api/admin/feature-flags')
}

export function updateAdminFeatureFlag(flagKey: string, body: Record<string, unknown>) {
  return mutateAdminJson(`/api/admin/feature-flags/${encodeURIComponent(flagKey)}`, 'PATCH', body)
}

export function fetchAdminUserGroups() {
  return fetchAdminJson<AdminUserGroupsResponse>('/api/admin/user-groups')
}

export function createAdminUserGroup(body: Record<string, unknown>) {
  return mutateAdminJson('/api/admin/user-groups', 'POST', body)
}

export function updateAdminUserGroup(groupKey: string, body: Record<string, unknown>) {
  return mutateAdminJson(`/api/admin/user-groups/${encodeURIComponent(groupKey)}`, 'PATCH', body)
}

export function fetchAdminCommercial() {
  return fetchAdminJson<AdminCommercialResponse>('/api/admin/commercial')
}

export function createAdminCommercialPackage(body: Record<string, unknown>) {
  return mutateAdminJson('/api/admin/commercial/packages', 'POST', body)
}

export function updateAdminCommercialPackage(packageKey: string, body: Record<string, unknown>) {
  return mutateAdminJson(`/api/admin/commercial/packages/${encodeURIComponent(packageKey)}`, 'PATCH', body)
}

export function createAdminRedeemCode(body: Record<string, unknown>) {
  return mutateAdminJson('/api/admin/commercial/redeem-codes', 'POST', body)
}

export function updateAdminRedeemCode(code: string, body: Record<string, unknown>) {
  return mutateAdminJson(`/api/admin/commercial/redeem-codes/${encodeURIComponent(code)}`, 'PATCH', body)
}

export function fetchAdminUsers(filters: { search?: string; role?: string; status?: string; group?: string } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return fetchAdminJson<AdminUsersResponse>(query ? `/api/admin/users?${query}` : '/api/admin/users')
}

export function updateAdminUser(userId: string, body: Record<string, unknown>) {
  return mutateAdminJson(`/api/admin/users/${encodeURIComponent(userId)}`, 'PATCH', body)
}

export function fetchAdminBilling() {
  return fetchAdminJson<AdminBillingResponse>('/api/admin/billing')
}

export function fetchAdminTasks() {
  return fetchAdminJson<AdminTasksResponse>('/api/admin/tasks')
}

export function cancelAdminTask(taskId: string, body: Record<string, unknown>) {
  return mutateAdminJson(`/api/admin/tasks/${encodeURIComponent(taskId)}`, 'POST', body)
}

export function createAdminTaskIncident(body: Record<string, unknown>) {
  return mutateAdminJson<AdminTaskIncident>('/api/admin/tasks/incidents', 'POST', body)
}

export function fetchAdminTaskIncident(incidentId: string) {
  return fetchAdminJson<AdminTaskIncident>(`/api/admin/tasks/incidents/${encodeURIComponent(incidentId)}`)
}

export function fetchAdminModels() {
  return fetchAdminJson<AdminModelsResponse>('/api/admin/models')
}

export function fetchAdminSystemHealth() {
  return fetchAdminJson<AdminSystemHealthResponse>('/api/admin/system-health')
}

export function runAdminSystemHealthCheck(body: Record<string, unknown>) {
  return mutateAdminJson<AdminSystemHealthResponse>('/api/admin/system-health', 'POST', body)
}

export function fetchAdminAuditLogs() {
  return fetchAdminJson<AdminAuditLogsResponse>('/api/admin/audit-logs')
}
