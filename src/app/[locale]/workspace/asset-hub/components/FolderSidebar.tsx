'use client'

import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'

interface Folder {
    id: string
    name: string
}

interface FolderSidebarProps {
    folders: Folder[]
    selectedFolderId: string | null
    onSelectFolder: (folderId: string | null) => void
    onCreateFolder: () => void
    onEditFolder: (folder: Folder) => void
    onDeleteFolder: (folderId: string) => void
}

// 内联 SVG 图标
const FolderIcon = ({ className }: { className?: string }) => (
    <AppIcon name="folder" className={className} />
)

const PlusIcon = ({ className }: { className?: string }) => (
    <AppIcon name="plus" className={className} />
)

const PencilIcon = ({ className }: { className?: string }) => (
    <AppIcon name="edit" className={className} />
)

const TrashIcon = ({ className }: { className?: string }) => (
    <AppIcon name="trash" className={className} />
)

export function FolderSidebar({
    folders,
    selectedFolderId,
    onSelectFolder,
    onCreateFolder,
    onEditFolder,
    onDeleteFolder
}: FolderSidebarProps) {
    const t = useTranslations('assetHub')

    return (
        <div className="w-56 flex-shrink-0">
            <div className="glass-surface-elevated p-4">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <div className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('folderKicker')}</div>
                        <h3 className="mt-2 text-sm font-medium text-[var(--glass-text-secondary)]">{t('folders')}</h3>
                    </div>
                    <button
                        onClick={onCreateFolder}
                        className="glass-btn-base glass-btn-primary h-6 w-6 rounded-full flex items-center justify-center"
                        title={t('newFolder')}
                    >
                        <PlusIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-1">
                    {/* 所有资产 */}
                    <button
                        onClick={() => onSelectFolder(null)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors border ${selectedFolderId === null
                                ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] border-[var(--glass-stroke-focus)]'
                                : 'text-[var(--glass-text-secondary)] border-transparent hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]'
                            }`}
                    >
                        <FolderIcon className="w-4 h-4" />
                        <span className="truncate">{t('allAssets')}</span>
                    </button>

                    {/* 文件夹列表 */}
                    {folders.map((folder) => (
                        <div
                            key={folder.id}
                            className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${selectedFolderId === folder.id
                                    ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] border-[var(--glass-stroke-focus)]'
                                    : 'text-[var(--glass-text-secondary)] border-transparent hover:bg-[var(--glass-bg-muted)] hover:text-[var(--glass-text-primary)]'
                                }`}
                        >
                            <button
                                onClick={() => onSelectFolder(folder.id)}
                                className="flex-1 flex items-center gap-2 text-left text-sm min-w-0"
                            >
                                <FolderIcon className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{folder.name}</span>
                            </button>

                            {/* 操作按钮 */}
                            <div className="hidden group-hover:flex items-center gap-0.5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onEditFolder(folder)
                                    }}
                                    className="glass-btn-base glass-btn-soft h-5 w-5 rounded flex items-center justify-center"
                                    title={t('editFolder')}
                                >
                                    <PencilIcon className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onDeleteFolder(folder.id)
                                    }}
                                    className="glass-btn-base glass-btn-tone-danger h-5 w-5 rounded flex items-center justify-center"
                                    title={t('deleteFolder')}
                                >
                                    <TrashIcon className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {folders.length === 0 && (
                        <div className="rounded-xl border border-dashed border-[var(--glass-stroke-base)] px-3 py-4 text-center text-xs text-[var(--glass-text-tertiary)]">
                            {t('noFolders')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
