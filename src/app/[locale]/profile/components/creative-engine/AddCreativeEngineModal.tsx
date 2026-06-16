'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { GlassModalShell } from '@/components/ui/primitives'
import { apiFetch } from '@/lib/api-fetch'
import type { CreativeModelListItem } from './CreativeModelList'
import { DetectionResultPanel, type CreativeEngineDetectionResult } from './DetectionResultPanel'
import { resolveCreativeEngineDisplayName } from './detection-save-draft'

interface AddCreativeEngineModalProps {
  onClose: () => void
  onSaved: (draft: {
    name: string
    serviceUrl: string
    apiKey: string
    recommendedProviderKey: string
    protocolType: string
    models: CreativeModelListItem[]
  }) => void | Promise<void>
}

type EntryMode = 'detect' | 'manual'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readMediaContractSource(value: unknown) {
  return value === 'rule'
    || value === 'provider-list'
    || value === 'llm'
    || value === 'manual'
    || value === 'official-adapter'
    ? value
    : undefined
}

function readCompatMediaTemplateSource(value: unknown) {
  return value === 'ai' || value === 'manual' ? value : undefined
}

function normalizeDetectionResult(raw: unknown, fallbackUrl: string): CreativeEngineDetectionResult {
  const payload = isRecord(raw) ? raw : {}
  const models = Array.isArray(payload.models) ? payload.models.filter(isRecord) : []
  return {
    source: readString(payload.source, 'unknown'),
    recommendedProviderKey: readString(payload.recommendedProviderKey, ''),
    confidence: readString(payload.confidence, 'low'),
    normalizedBaseUrl: readString(payload.normalizedBaseUrl, fallbackUrl),
    protocolType: readString(payload.protocolType, ''),
    status: readString(payload.status, 'unchecked'),
    models: models.map((model, index) => {
      const mediaContractSource = readMediaContractSource(model.mediaContractSource)
      const compatMediaTemplateSource = readCompatMediaTemplateSource(model.compatMediaTemplateSource)
      return {
        id: readString(model.id, `model-${index}`),
        name: readString(model.name, readString(model.callName, `Model ${index + 1}`)),
        callName: readString(model.callName, readString(model.id, `model-${index}`)),
        modelKey: readString(model.modelKey, ''),
        purpose: readString(model.purpose, 'unknown') as CreativeEngineDetectionResult['models'][number]['purpose'],
        status: readString(model.status, 'unchecked') as CreativeEngineDetectionResult['models'][number]['status'],
        ...(isRecord(model.mediaContract) ? { mediaContract: model.mediaContract as unknown as CreativeEngineDetectionResult['models'][number]['mediaContract'] } : {}),
        ...(mediaContractSource ? { mediaContractSource } : {}),
        ...(isRecord(model.compatMediaTemplate) ? { compatMediaTemplate: model.compatMediaTemplate as unknown as CreativeEngineDetectionResult['models'][number]['compatMediaTemplate'] } : {}),
        ...(compatMediaTemplateSource ? { compatMediaTemplateSource } : {}),
      }
    }),
  }
}

export function AddCreativeEngineModal({ onClose, onSaved }: AddCreativeEngineModalProps) {
  const t = useTranslations('apiConfig')
  const [serviceName, setServiceName] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [allowKeyInInspector, setAllowKeyInInspector] = useState(true)
  const [mode, setMode] = useState<EntryMode>('detect')
  const [result, setResult] = useState<CreativeEngineDetectionResult | null>(null)
  const [error, setError] = useState('')
  const [isDetecting, setIsDetecting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const canSubmit = useMemo(() => serviceUrl.trim().length > 0 && apiKey.trim().length > 0, [apiKey, serviceUrl])

  const handleDetect = async () => {
    if (!canSubmit) return
    setIsDetecting(true)
    setError('')
    try {
      const response = await apiFetch('/api/user/creative-engines/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceUrl: serviceUrl.trim(),
          apiKey: apiKey.trim(),
          allowKeyInInspector,
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setResult(normalizeDetectionResult(data, serviceUrl.trim()))
    } catch {
      setError(t('creativeEngine.detectFailed'))
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSave = async () => {
    if (isSaving) return
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSaved({
        name: resolveCreativeEngineDisplayName({
          serviceName,
          detectedSource: result?.source,
          fallbackName: t('creativeEngine.serviceNamePlaceholder'),
        }),
        serviceUrl: result?.normalizedBaseUrl || serviceUrl.trim(),
        apiKey: apiKey.trim(),
        recommendedProviderKey: result?.recommendedProviderKey || '',
        protocolType: result?.protocolType || 'openai-compatible',
        models: result?.models || [],
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <GlassModalShell
      open
      onClose={onClose}
      title={t('creativeEngine.addTitle')}
      description={t('creativeEngine.addDescription')}
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm">
            {t('cancel')}
          </button>
          {!result ? (
            <>
              <button
                type="button"
                disabled={!canSubmit || isSaving}
                onClick={handleSave}
                className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? t('saving') : t('creativeEngine.skipDetectionAndSave')}
              </button>
              <button
                type="button"
                disabled={!canSubmit || isDetecting}
                onClick={handleDetect}
                className="glass-btn-base glass-btn-primary inline-flex items-center gap-2 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDetecting ? (
                  <AppIcon name="loader" className="h-4 w-4 animate-spin" />
                ) : (
                  <AppIcon name="sparkles" className="h-4 w-4" />
                )}
                {isDetecting ? t('creativeEngine.detecting') : t('creativeEngine.autoDetect')}
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="inline-flex rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('detect')}
            className={`rounded-lg px-3 py-1.5 ${mode === 'detect' ? 'bg-[var(--glass-bg-base)] text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-secondary)]'}`}
          >
            {t('creativeEngine.autoDetect')}
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`rounded-lg px-3 py-1.5 ${mode === 'manual' ? 'bg-[var(--glass-bg-base)] text-[var(--glass-text-primary)]' : 'text-[var(--glass-text-secondary)]'}`}
          >
            {t('creativeEngine.manualConfig')}
          </button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
            {t('creativeEngine.serviceName')}
          </span>
          <input
            type="text"
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            placeholder={t('creativeEngine.serviceNamePlaceholder')}
            className="glass-input-base w-full px-3 py-2.5 text-sm"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('creativeEngine.serviceAddress')}
            </span>
            <input
              type="text"
              value={serviceUrl}
              onChange={(event) => setServiceUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              className="glass-input-base w-full px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--glass-text-primary)]">
              {t('creativeEngine.key')}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={t('creativeEngine.key')}
              className="glass-input-base w-full px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        <label className="flex items-start gap-2 text-xs text-[var(--glass-text-secondary)]">
          <input
            type="checkbox"
            checked={allowKeyInInspector}
            onChange={(event) => setAllowKeyInInspector(event.target.checked)}
            className="mt-0.5"
          />
          <span>{t('creativeEngine.smartRecognitionDisclosure')}</span>
        </label>

        {mode === 'manual' ? (
          <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-3 text-sm text-[var(--glass-text-secondary)]">
            {t('creativeEngine.manualModeHint')}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        ) : null}

        {result ? (
          <DetectionResultPanel
            result={result}
            isSaving={isSaving}
            onSave={handleSave}
            onViewModels={handleSave}
            onRedetect={() => void handleDetect()}
            onManualAdjust={() => setMode('manual')}
          />
        ) : null}
      </div>
    </GlassModalShell>
  )
}
