'use client'

/**
 * AnimatedBackground - 流光极光背景动画
 * 用于页面全局背景
 */
export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 -z-10 overflow-hidden bg-[var(--glass-bg-canvas)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,208,255,0.14),transparent_24%),radial-gradient(circle_at_85%_0%,rgba(79,141,255,0.16),transparent_26%),linear-gradient(180deg,#0a0f18_0%,#060910_100%)]" />
            <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(138,154,191,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(138,154,191,0.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.6),transparent_82%)]" />
            <div className="absolute top-[-50%] left-[-50%] h-[200%] w-[200%] opacity-45 animate-aurora blur-[120px]">
                <div className="absolute top-[10%] left-[8%] h-[40%] w-[40%] rounded-full bg-[#102749] animate-blob" />
                <div className="absolute top-[8%] right-[6%] h-[34%] w-[34%] rounded-full bg-[#103653] animate-blob animation-delay-2000" />
                <div className="absolute bottom-[4%] left-[26%] h-[38%] w-[38%] rounded-full bg-[#0b1a2f] animate-blob animation-delay-4000" />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,6,12,0.16),rgba(4,6,12,0.58))] backdrop-blur-[72px]" />
        </div>
    )
}

/**
 * GlassPanel - 毛玻璃卡片容器
 */
export function GlassPanel({
    children,
    className = ''
}: {
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`
      glass-surface-elevated
      ${className}
    `}>
            {children}
        </div>
    )
}

/**
 * Button - 通用按钮组件
 */
export function Button({
    children,
    primary = false,
    onClick,
    disabled = false,
    icon,
    className = ''
}: {
    children: React.ReactNode
    primary?: boolean
    onClick?: () => void
    disabled?: boolean
    icon?: React.ReactNode
    className?: string
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
        glass-btn-base px-6 py-2.5
        ${primary
                    ? 'glass-btn-primary text-white'
                    : 'glass-btn-secondary'}
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
        >
            {icon && <span>{icon}</span>}
            {children}
        </button>
    )
}
