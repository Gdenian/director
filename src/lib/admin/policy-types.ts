import type { AdminRole } from '@/lib/admin/roles'
import type { OperationErrorCode } from './operation-errors'

export type FeatureFlagKey =
  | 'registration'
  | 'create_work'
  | 'text_generation'
  | 'image_generation'
  | 'video_generation'
  | 'voice_generation'
  | 'lip_sync'
  | 'payment'
  | 'redeem_code'
  | 'advanced_models'
  | 'maintenance_mode'

export type OperationCapability =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'lip_sync'
  | 'advanced_models'
  | 'payment'
  | 'redeem_code'
  | 'create_work'

export interface OperationAudienceContext {
  userId?: string | null
  role?: AdminRole | string | null
  groupKey?: string | null
  groupKeys?: string[]
}

export interface AudienceRule {
  audience?: string | null
  groupKeys?: string[] | null
  targetUserIds?: string[] | null
}

export interface TimeWindow {
  startsAt?: Date | string | null
  endsAt?: Date | string | null
}

export interface PolicyDecision {
  allowed: boolean
  code?: OperationErrorCode
  message?: string
  target?: string
}
