'use client'

import React from 'react'
import type { CustomModel } from '../types'
import { mediaCapabilityStatusKey } from '@/lib/media-contract/status'
import type { MediaCapability, MediaCapabilityStatus } from '@/lib/media-contract/types'
import type { ProviderCardTranslator } from './types'

interface MediaCapabilityRowsProps {
  model: CustomModel
  onRunTest: (modelKey: string, capability: MediaCapability) => void
  pendingCapability?: MediaCapability | null
  t: ProviderCardTranslator
}

const CAPABILITY_LABEL_KEYS: Record<MediaCapability, string> = {
  'text-to-image': 'mediaCapabilityTextToImage',
  'image-to-image': 'mediaCapabilityImageToImage',
  'image-edit': 'mediaCapabilityImageEdit',
  'text-to-video': 'mediaCapabilityTextToVideo',
  'image-to-video': 'mediaCapabilityImageToVideo',
  'first-last-frame-video': 'mediaCapabilityFirstLastFrameVideo',
}

const STATUS_LABEL_KEYS: Record<MediaCapabilityStatus, string> = {
  passed: 'mediaCapabilityStatusPassed',
  unchecked: 'mediaCapabilityStatusUnchecked',
  failed: 'mediaCapabilityStatusFailed',
  unavailable: 'mediaCapabilityStatusUnavailable',
}

function readCapabilityStatus(model: CustomModel, capability: MediaCapability): MediaCapabilityStatus {
  const contract = model.mediaContract
  if (!contract?.capabilities.includes(capability)) return 'unavailable'
  if (contract.executor === 'official-adapter') return 'passed'
  return contract.testStatus?.[mediaCapabilityStatusKey(capability)] || 'unchecked'
}

function capabilitiesForModel(model: CustomModel): MediaCapability[] {
  if (model.type === 'image') return ['text-to-image', 'image-to-image', 'image-edit']
  if (model.type === 'video') return ['text-to-video', 'image-to-video', 'first-last-frame-video']
  return []
}

export function MediaCapabilityRows({
  model,
  onRunTest,
  pendingCapability = null,
  t,
}: MediaCapabilityRowsProps) {
  const capabilities = capabilitiesForModel(model)
  if (capabilities.length === 0) return null

  if (!model.mediaContract) {
    return (
      <div className="mt-1 rounded-lg bg-[var(--glass-tone-warning-bg)] px-2 py-1 text-[11px] font-medium text-[var(--glass-tone-warning-fg)]">
        {t('mediaContractUnverified')}
      </div>
    )
  }

  return (
    <div className="mt-1.5 space-y-1">
      {capabilities.map((capability) => {
        const status = readCapabilityStatus(model, capability)
        const canRunTest = status === 'unchecked' || status === 'failed'
        const isPending = pendingCapability === capability
        const isAnyTestPending = pendingCapability !== null

        return (
          <div
            key={capability}
            className="flex min-h-6 items-center justify-between gap-2 rounded-lg bg-[var(--glass-bg-muted)] px-2 py-1 text-[11px]"
          >
            <span className="min-w-0 truncate font-medium text-[var(--glass-text-secondary)]">
              {t(CAPABILITY_LABEL_KEYS[capability])}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="font-semibold text-[var(--glass-text-tertiary)]">
                {t(STATUS_LABEL_KEYS[status])}
              </span>
              {canRunTest && (
                <button
                  type="button"
                  onClick={() => onRunTest(model.modelKey, capability)}
                  disabled={isAnyTestPending}
                  className="glass-btn-base glass-btn-soft px-1.5 py-0.5 text-[11px] font-medium"
                >
                  {isPending ? t('mediaCapabilityTesting') : t('mediaCapabilityRunTest')}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
