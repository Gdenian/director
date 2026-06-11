'use client'

/**
 * 首页 - 创作中心
 * 用户登录后的主入口页面：快速创作 + 作品集
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import StoryInputComposer from '@/components/story-input/StoryInputComposer'
import StyleAssetSelect from '@/components/shared/assets/StyleAssetSelect'
import TypewriterHero from '@/components/home/TypewriterHero'
import CircularGallery, { type CircularGalleryItem } from '@/components/home/CircularGallery'
import { VIDEO_RATIOS } from '@/lib/constants'
import { DEFAULT_STYLE_PRESET_VALUE, STYLE_PRESETS } from '@/lib/style-presets'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { expandHomeStory } from '@/lib/home/ai-story-expand'
import { createHomeProjectLaunch } from '@/lib/home/create-project-launch'
import { formatDefaultProjectTimestamp } from '@/lib/projects/default-name'
import { HOME_QUICK_START_MIN_ROWS } from '@/lib/ui/textarea-height'
import AiWriteModal from '@/components/home/AiWriteModal'

interface ProjectStats {
  mainCharacterImageUrl: string | null
}

interface Project {
  id: string
  name: string
  stats?: ProjectStats
}

const RECENT_COUNT = 5
const EMPTY_GALLERY_COUNT = 8

function toSvgDataUri(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const EMPTY_PROJECT_CARD_IMAGE = toSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <rect width="800" height="800" rx="54" fill="#07090d"/>
    <rect x="38" y="38" width="724" height="724" rx="44" fill="#0d1118" stroke="rgba(148,163,184,0.34)" stroke-width="3"/>
    <path d="M400 286v228M286 400h228" stroke="rgba(255,255,255,0.74)" stroke-width="30" stroke-linecap="round"/>
  </svg>
`)

const PROJECT_IMAGE_PLACEHOLDER = toSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <rect width="800" height="800" rx="54" fill="#07090d"/>
    <rect x="38" y="38" width="724" height="724" rx="44" fill="#0d1118" stroke="rgba(148,163,184,0.28)" stroke-width="3"/>
    <path d="M250 496c38-72 85-108 141-108 46 0 83 22 112 66 18-16 39-24 63-24 41 0 75 22 102 66" fill="none" stroke="rgba(148,163,184,0.55)" stroke-width="22" stroke-linecap="round"/>
    <circle cx="310" cy="300" r="48" fill="rgba(148,163,184,0.36)"/>
  </svg>
`)

const EMPTY_PROJECT_GALLERY_ITEMS: CircularGalleryItem[] = Array.from({ length: EMPTY_GALLERY_COUNT }, () => ({
  image: EMPTY_PROJECT_CARD_IMAGE,
  text: '',
}))

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('home')
  const tc = useTranslations('common')

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const [videoRatio, setVideoRatio] = useState('9:16')
  const [styleAssetId, setStyleAssetId] = useState('')
  const [stylePresetValue, setStylePresetValue] = useState<string>(DEFAULT_STYLE_PRESET_VALUE)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [aiWriteOpen, setAiWriteOpen] = useState(false)
  const [aiWriteLoading, setAiWriteLoading] = useState(false)

  // 鉴权
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push({ pathname: '/auth/signin' })
    }
  }, [session, status, router])

  // 获取最近项目
  const fetchRecentProjects = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: '1',
        pageSize: RECENT_COUNT.toString(),
      })
      const response = await apiFetch(`/api/projects?${params}`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects)
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) {
      void fetchRecentProjects()
    }
  }, [session, fetchRecentProjects])

  // 创建项目并跳转
  const handleCreate = async () => {
    if (!inputValue.trim() || createLoading) return
    setCreateError(null)
    setCreateLoading(true)
    try {
      const storyText = inputValue.trim()
      const result = await createHomeProjectLaunch({
        apiFetch,
        projectName: t('defaultProjectName', {
          timestamp: formatDefaultProjectTimestamp(new Date()),
        }),
        storyText,
        videoRatio,
        styleAssetId: styleAssetId || null,
        episodeName: `${tc('episode')} 1`,
      })

      router.push(result.target)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('createFailed')
      setCreateError(message)
    } finally {
      setCreateLoading(false)
    }
  }

  // AI 创意加速 — 直接生成文本并回填首页输入框
  const handleAiWriteStart = async (prompt: string) => {
    if (aiWriteLoading) return
    setAiWriteLoading(true)
    try {
      const result = await expandHomeStory({
        apiFetch,
        prompt,
      })

      setInputValue(result.expandedText)
      setAiWriteOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed'
      window.alert(message)
    } finally {
      setAiWriteLoading(false)
    }
  }

  // 比例选项（带推荐标签）
  const ratioOptions = useMemo(
    () => VIDEO_RATIOS.map((r) => ({ ...r, recommended: r.value === '9:16' })),
    []
  )

  const projectGalleryItems = useMemo<CircularGalleryItem[]>(() => (
    projects.map((project) => ({
      image: project.stats?.mainCharacterImageUrl || PROJECT_IMAGE_PLACEHOLDER,
      text: project.name,
    }))
  ), [projects])

  const handleProjectCardClick = useCallback((index: number) => {
    const project = projects[index]
    if (!project) return

    router.push({ pathname: `/workspace/${project.id}` })
  }, [projects, router])

  const openWorkspaceCreateModal = useCallback(() => {
    router.push({ pathname: '/workspace', query: { create: 'project' } })
  }, [router])

  if (status === 'loading' || !session) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center" style={{ backgroundColor: '#000' }}>
        <div className="text-[var(--glass-text-secondary)]">{tc('loading')}</div>
      </div>
    )
  }

  return (
    <div className="glass-page min-h-screen" style={{ backgroundColor: '#000' }}>
      <Navbar />

      {/* 自定义呼吸动画 */}
      <style>{`
        @keyframes breathe-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          25% { transform: translate(30px, -20px) scale(1.15); opacity: 0.7; }
          50% { transform: translate(-20px, 15px) scale(0.95); opacity: 0.4; }
          75% { transform: translate(15px, 25px) scale(1.1); opacity: 0.65; }
        }
        @keyframes breathe-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.45; }
          30% { transform: translate(-25px, 20px) scale(1.2); opacity: 0.7; }
          60% { transform: translate(20px, -15px) scale(0.9); opacity: 0.35; }
          80% { transform: translate(-10px, -25px) scale(1.05); opacity: 0.6; }
        }
        @keyframes breathe-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1.05); opacity: 0.4; }
          20% { transform: translate(20px, 15px) scale(0.9); opacity: 0.55; }
          45% { transform: translate(-15px, -20px) scale(1.15); opacity: 0.7; }
          70% { transform: translate(10px, -10px) scale(1); opacity: 0.35; }
        }
        @keyframes bracket-breathe {
          0%, 70%, 100% { opacity: 0.2; }
          75%, 90% { opacity: 0.6; }
        }
      `}</style>

      <main className="flex flex-col items-center pt-[13vh] pb-12 px-4 max-w-5xl mx-auto w-full">

        {/* ─── 取景器整体包裹：标题 + 输入框 ─── */}
        <div className="w-full relative p-5">
          {/* 四角校准线 */}
          <span className="absolute top-0 left-0 w-5 h-5 border-t border-l border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />
          <span className="absolute top-0 right-0 w-5 h-5 border-t border-r border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />
          <span className="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />
          <span className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-[var(--glass-text-primary)] pointer-events-none z-10" style={{ animation: 'bracket-breathe 8s ease-in-out infinite' }} />

          {/* REC 录制指示灯 */}
          <span
            className="absolute top-2 right-7 flex items-center gap-1 z-10"
            style={{ animation: 'bracket-breathe 2s ease-in-out infinite' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.7)]" />
            <span className="text-[8px] font-mono font-bold tracking-widest text-red-500/70">REC</span>
          </span>

          {/* 标题区 */}
          <TypewriterHero title={t('title')} subtitle={t('subtitle')} />

          {/* 呼吸光晕 + 输入区域 */}
          <div className="w-full relative group">
            <div
              className="absolute -inset-10 rounded-[48px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 80% 60% at 30% 40%, rgba(6, 182, 212, 0.4), transparent 70%)',
                animation: 'breathe-drift-1 8s ease-in-out infinite',
                filter: 'blur(30px)',
              }}
            />
            <div
              className="absolute -inset-10 rounded-[48px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 80% at 70% 60%, rgba(139, 92, 246, 0.35), transparent 70%)',
                animation: 'breathe-drift-2 10s ease-in-out infinite',
                filter: 'blur(35px)',
              }}
            />
            <div
              className="absolute -inset-12 rounded-[56px] pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59, 130, 246, 0.3), transparent 70%)',
                animation: 'breathe-drift-3 12s ease-in-out infinite',
                filter: 'blur(40px)',
              }}
            />

            <StoryInputComposer
              value={inputValue}
              onValueChange={(nextValue) => {
                setInputValue(nextValue)
                if (createError) {
                  setCreateError(null)
                }
              }}
              placeholder={t('inputPlaceholder')}
              borderGlow={{
                edgeSensitivity: 44,
                glowColor: '40 80 80',
                backgroundColor: '#120F17',
                borderRadius: 28,
                glowRadius: 40,
                glowIntensity: 2,
                coneSpread: 25,
                animated: true,
                colors: ['#c084fc', '#f472b6', '#38bdf8'],
              }}
              minRows={HOME_QUICK_START_MIN_ROWS}
              textareaClassName="px-0 pt-0 pb-3 align-top"
              videoRatio={videoRatio}
              onVideoRatioChange={setVideoRatio}
              ratioOptions={ratioOptions}
              styleControl={(
                <StyleAssetSelect
                  value={styleAssetId}
                  onChange={setStyleAssetId}
                  onCreateStyle={() => router.push({ pathname: '/workspace/asset-hub', query: { create: 'style' } })}
                  mode="asset-hub"
                  showLabel={false}
                  showHint={false}
                />
              )}
              stylePresetValue={stylePresetValue}
              onStylePresetChange={setStylePresetValue}
              stylePresetOptions={STYLE_PRESETS}
              primaryAction={(
                <button
                  onClick={() => void handleCreate()}
                  disabled={!inputValue.trim() || createLoading}
                  className="glass-btn-base glass-btn-primary h-10 flex-shrink-0 px-5 text-sm disabled:opacity-50"
                >
                  {createLoading ? tc('loading') : t('startCreation')}
                  <AppIcon name="arrowRight" className="w-4 h-4" />
                </button>
              )}
              secondaryActions={(
                <button
                  onClick={() => setAiWriteOpen(true)}
                  disabled={createLoading}
                  className="glass-btn-base flex h-10 flex-shrink-0 items-center gap-1.5 border border-[var(--glass-stroke-strong)] px-3 text-sm transition-all hover:border-[var(--glass-tone-info-fg)]/40"
                >
                  <AppIcon name="sparklesAlt" className="w-4 h-4 text-[#f59e0b]" />
                  <span
                    className="font-medium"
                    style={{
                      background: 'linear-gradient(135deg, #facc15, #a855f7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {t('aiWrite.trigger')}
                  </span>
                </button>
              )}
              footer={createError ? (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                  {createError}
                </p>
              ) : null}
            />
          </div>
        </div>
        {/* AI 创意加速模态框 */}
        <AiWriteModal
          open={aiWriteOpen}
          loading={aiWriteLoading}
          onClose={() => setAiWriteOpen(false)}
          onStart={(prompt) => void handleAiWriteStart(prompt)}
          t={(key: string) => t(`aiWrite.${key}`)}
        />
      </main>

      {/* 作品集 */}
      <section className="px-4 sm:px-6 lg:px-10 pb-8 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[var(--glass-text-secondary)]">{t('recentProjects')}</h2>
          <Link
            href={{ pathname: '/workspace' }}
            className="text-xs text-[var(--glass-tone-info-fg)] hover:underline font-medium"
          >
            {t('viewAll')}
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-surface p-5 animate-pulse">
                <div className="h-4 bg-[var(--glass-bg-muted)] rounded mb-3" />
                <div className="h-3 bg-[var(--glass-bg-muted)] rounded mb-2" />
                <div className="h-3 bg-[var(--glass-bg-muted)] rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="relative -mx-4 h-[320px] overflow-hidden sm:mx-0 sm:h-[380px] lg:h-[420px]">
            <CircularGallery
              items={projects.length > 0 ? projectGalleryItems : EMPTY_PROJECT_GALLERY_ITEMS}
              bend={3}
              textColor="#ffffff"
              borderRadius={0.16}
              scrollEase={0.02}
              onItemClick={projects.length > 0 ? handleProjectCardClick : () => openWorkspaceCreateModal()}
              onClick={projects.length === 0 ? openWorkspaceCreateModal : undefined}
            />
          </div>
        )}
      </section>
    </div>
  )
}
