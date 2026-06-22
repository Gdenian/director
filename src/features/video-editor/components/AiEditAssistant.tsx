'use client'

import React, { FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PendingEditorVersion } from '../types/editor.types'

interface AiEditAssistantProps {
    pendingVersion: PendingEditorVersion | null
    isSubmitting?: boolean
    isApplying?: boolean
    isDiscarding?: boolean
    error?: string | null
    onSubmitInstruction: (instruction: string) => void | Promise<unknown>
    onApplyPending: () => void | Promise<unknown>
    onDiscardPending: () => void | Promise<unknown>
    onClearError?: () => void
}

export function AiEditAssistant({
    pendingVersion,
    isSubmitting = false,
    isApplying = false,
    isDiscarding = false,
    error = null,
    onSubmitInstruction,
    onApplyPending,
    onDiscardPending,
    onClearError,
}: AiEditAssistantProps) {
    const t = useTranslations('video')
    const [instruction, setInstruction] = useState('')

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const trimmed = instruction.trim()
        if (!trimmed || isSubmitting) return

        try {
            await onSubmitInstruction(trimmed)
            setInstruction('')
        } catch {
            // Error state is owned by useAiEditing and rendered below.
        }
    }

    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--glass-text-secondary)' }}>
                    {t('editor.aiAssistant.title')}
                </h3>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                        value={instruction}
                        onChange={(event) => setInstruction(event.target.value)}
                        placeholder={t('editor.aiAssistant.instructionPlaceholder')}
                        rows={4}
                        style={{
                            width: '100%',
                            resize: 'vertical',
                            borderRadius: '8px',
                            border: '1px solid var(--glass-stroke-base)',
                            background: 'var(--glass-bg-surface)',
                            color: 'var(--glass-text-primary)',
                            padding: '8px',
                            fontSize: '12px',
                            lineHeight: 1.5,
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!instruction.trim() || isSubmitting}
                        className="glass-btn-base glass-btn-primary px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSubmitting ? t('editor.aiAssistant.submitting') : t('editor.aiAssistant.submit')}
                    </button>
                </form>
            </div>

            {error ? (
                <div
                    role="alert"
                    style={{
                        borderRadius: '8px',
                        border: '1px solid var(--glass-danger-stroke, #ef4444)',
                        background: 'var(--glass-danger-bg, rgba(239, 68, 68, 0.1))',
                        color: 'var(--glass-text-primary)',
                        padding: '8px',
                        fontSize: '12px',
                        lineHeight: 1.5,
                    }}
                >
                    <div>{error}</div>
                    {onClearError ? (
                        <button
                            type="button"
                            onClick={onClearError}
                            className="glass-btn-base glass-btn-ghost mt-2 px-2 py-1 text-xs"
                        >
                            {t('editor.aiAssistant.dismissError')}
                        </button>
                    ) : null}
                </div>
            ) : null}

            {pendingVersion ? (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-stroke-base)',
                        background: 'var(--glass-bg-surface)',
                        padding: '10px',
                        fontSize: '12px',
                    }}
                >
                    <div style={{ color: 'var(--glass-text-secondary)', fontWeight: 600 }}>
                        {t('editor.aiAssistant.pendingTitle')}
                    </div>
                    <p style={{ margin: 0, color: 'var(--glass-text-primary)', lineHeight: 1.5 }}>
                        {pendingVersion.summary}
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => { void Promise.resolve(onApplyPending()).catch(() => undefined) }}
                            disabled={isApplying}
                            className="glass-btn-base glass-btn-tone-success px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isApplying ? t('editor.aiAssistant.applying') : t('editor.aiAssistant.applyPending')}
                        </button>
                        <button
                            type="button"
                            onClick={() => { void Promise.resolve(onDiscardPending()).catch(() => undefined) }}
                            disabled={isDiscarding}
                            className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isDiscarding ? t('editor.aiAssistant.discarding') : t('editor.aiAssistant.discardPending')}
                        </button>
                    </div>
                </div>
            ) : (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--glass-text-tertiary)', lineHeight: 1.5 }}>
                    {t('editor.aiAssistant.emptyPending')}
                </p>
            )}
        </section>
    )
}

export default AiEditAssistant
