'use client'

import React, { ChangeEvent, FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AiEditableMediaEntry, AiEditableMediaLibrary } from '@/lib/novel-promotion/ai-editing/tool-types'

interface EditorMediaPanelProps {
    media: AiEditableMediaLibrary | null
    isLoading?: boolean
    isImporting?: boolean
    onImportFile: (file: File) => void | Promise<unknown>
    onImportUrl: (url: string) => void | Promise<unknown>
    onRefresh: () => void | Promise<unknown>
}

export function EditorMediaPanel({
    media,
    isLoading = false,
    isImporting = false,
    onImportFile,
    onImportUrl,
    onRefresh,
}: EditorMediaPanelProps) {
    const t = useTranslations('video')
    const [url, setUrl] = useState('')

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file || isImporting) return

        try {
            await onImportFile(file)
            event.target.value = ''
        } catch {
            // Error state is surfaced by the parent AI editing hook.
        }
    }

    const handleUrlSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const trimmed = url.trim()
        if (!trimmed || isImporting) return

        try {
            await onImportUrl(trimmed)
            setUrl('')
        } catch {
            // Error state is surfaced by the parent AI editing hook.
        }
    }

    const entries = media?.entries ?? []

    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ flex: 1, margin: 0, fontSize: '14px', color: 'var(--glass-text-secondary)' }}>
                    {t('editor.media.title')}
                </h3>
                <button
                    type="button"
                    onClick={() => { void Promise.resolve(onRefresh()).catch(() => undefined) }}
                    disabled={isLoading}
                    className="glass-btn-base glass-btn-ghost px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    title={t('editor.media.refresh')}
                >
                    {t('editor.media.refresh')}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--glass-text-secondary)' }}>
                    {t('editor.media.importFile')}
                    <input
                        type="file"
                        accept="video/*,image/*,audio/*"
                        disabled={isImporting}
                        onChange={handleFileChange}
                        style={{ width: '100%', fontSize: '12px' }}
                    />
                </label>

                <form onSubmit={handleUrlSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="editor-media-url" style={{ fontSize: '12px', color: 'var(--glass-text-secondary)' }}>
                        {t('editor.media.importUrl')}
                    </label>
                    <input
                        id="editor-media-url"
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder={t('editor.media.importUrlPlaceholder')}
                        disabled={isImporting}
                        style={{
                            width: '100%',
                            borderRadius: '8px',
                            border: '1px solid var(--glass-stroke-base)',
                            background: 'var(--glass-bg-surface)',
                            color: 'var(--glass-text-primary)',
                            padding: '7px 8px',
                            fontSize: '12px',
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!url.trim() || isImporting}
                        className="glass-btn-base glass-btn-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isImporting ? t('editor.media.importing') : t('editor.media.importUrlSubmit')}
                    </button>
                </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                {isLoading ? (
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--glass-text-tertiary)' }}>
                        {t('editor.media.loading')}
                    </p>
                ) : entries.length > 0 ? (
                    entries.map((entry) => <MediaEntryCard key={entry.id} entry={entry} />)
                ) : (
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--glass-text-tertiary)' }}>
                        {t('editor.media.empty')}
                    </p>
                )}
            </div>
        </section>
    )
}

function MediaEntryCard({ entry }: { entry: AiEditableMediaEntry }) {
    const t = useTranslations('video')
    const sourceLabel = isGeneratedSource(entry.sourceType)
        ? t('editor.media.source.generated')
        : t('editor.media.source.imported')
    const statusLabel = {
        pending: t('editor.media.status.pending'),
        completed: t('editor.media.status.completed'),
        failed: t('editor.media.status.failed'),
        canceled: t('editor.media.status.canceled'),
    }[entry.status]

    return (
        <article
            style={{
                borderRadius: '8px',
                border: '1px solid var(--glass-stroke-base)',
                background: 'var(--glass-bg-surface)',
                padding: '8px',
                fontSize: '12px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong style={{ flex: 1, color: 'var(--glass-text-primary)', overflowWrap: 'anywhere' }}>
                    {entry.label}
                </strong>
                <span style={{ color: 'var(--glass-text-tertiary)' }}>
                    {entry.kind}
                </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', color: 'var(--glass-text-secondary)' }}>
                <span>{sourceLabel}</span>
                <span>{statusLabel}</span>
            </div>
        </article>
    )
}

function isGeneratedSource(sourceType: AiEditableMediaEntry['sourceType']) {
    return sourceType === 'generated_panel_video'
        || sourceType === 'generated_lip_sync_video'
        || sourceType === 'generated_transition_bridge'
        || sourceType === 'voice_audio'
        || sourceType === 'subtitle_source'
}

export default EditorMediaPanel
