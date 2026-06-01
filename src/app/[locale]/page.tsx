'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { Link } from '@/i18n/navigation'
import SplashCursor from '@/components/home/SplashCursor'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'

export default function Home() {
  const t = useTranslations('landing')
  const { status } = useSession()
  const router = useRouter()

  // 已登录用户自动跳转到 home
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(buildAuthenticatedHomeTarget())
    }
  }, [status, router])

  // session 加载中或已登录（即将跳转），不渲染落地页，避免闪烁
  if (status !== 'unauthenticated') {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/logo-small.png?v=3"
            alt="director"
            width={80}
            height={80}
            className="animate-pulse"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#05050a] font-sans text-white selection:bg-white/20">
      <div className="relative z-50">
        <Navbar />
      </div>

      <div className="fixed inset-0 z-0 bg-[#05050a]">
        <div aria-hidden="true" className="absolute inset-0 h-full w-full opacity-95">
          <SplashCursor
            SIM_RESOLUTION={128}
            DYE_RESOLUTION={1440}
            DENSITY_DISSIPATION={3.5}
            VELOCITY_DISSIPATION={2}
            PRESSURE={0.1}
            CURL={3}
            SPLAT_RADIUS={0.2}
            SPLAT_FORCE={6000}
            COLOR_UPDATE_SPEED={10}
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,10,0.9)_0%,rgba(5,5,10,0.58)_38%,rgba(5,5,10,0.18)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(0deg,rgba(5,5,10,0.96),transparent)]" />
      </div>

      <main className="relative z-10">
        <section className="relative flex min-h-[calc(100vh-4rem)] items-center px-5 pb-12 pt-24 sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-7xl items-center">
            <div className="max-w-3xl animate-slide-up space-y-8" style={{ animationDuration: '0.8s' }}>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.06] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/72 backdrop-blur-md">
                {t('eyebrow')}
              </div>

              <h1 className="max-w-4xl text-6xl font-bold leading-none text-white md:text-8xl lg:text-9xl">
                <span className="block">
                  {t('title')}
                </span>
                <span className="mt-3 block text-white/68">
                  {t('subtitle')}
                </span>
              </h1>

              <div className="max-w-2xl text-base leading-8 text-white/68 md:text-lg">
                {t('description')}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2 animate-fade-in" style={{ animationDelay: '0.6s' }}>
                <Link
                  href={{ pathname: '/auth/signup' }}
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black shadow-[0_18px_60px_rgba(255,255,255,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/90"
                >
                  {t('getStarted')}
                </Link>

                <Link
                  href={{ pathname: '/auth/signin' }}
                  className="inline-flex items-center justify-center rounded-full border border-white/18 bg-white/[0.05] px-7 py-3.5 text-sm font-semibold text-white/82 backdrop-blur-md transition-all duration-300 hover:border-white/30 hover:bg-white/[0.1] hover:text-white"
                >
                  {t('login')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
