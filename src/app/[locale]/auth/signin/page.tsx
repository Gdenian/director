'use client'

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useTranslations } from 'next-intl'
import Navbar from "@/components/Navbar"
import { Link, useRouter } from '@/i18n/navigation'
import { buildAuthenticatedHomeTarget } from '@/lib/home/default-route'

export default function SignIn() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const t = useTranslations('auth')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      })

      if (result?.error === 'RateLimited') {
        setError(t('rateLimited'))
      } else if (result?.error) {
        setError(t('loginFailed'))
      } else {
        router.push(buildAuthenticatedHomeTarget())
        router.refresh()
      }
    } catch {
      setError(t('loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="studio-shell glass-page min-h-screen">
      <Navbar />
      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-72px)] max-w-[1280px] items-center gap-10 px-4 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.8fr)]">
        <div className="hidden lg:block">
          <div className="studio-hero-panel max-w-xl p-8">
            <span className="studio-kicker">{t('signinHeroKicker')}</span>
            <h1 className="studio-display mt-6 text-6xl font-bold leading-[0.92] text-[var(--glass-text-primary)]">
              {t('welcomeBack')}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-[var(--glass-text-secondary)]">
              {t('signinHeroDescription')}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="studio-media-frame p-5">
                <div className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('signinHeroProjectLabel')}</div>
                <div className="mt-3 text-xl font-semibold text-[var(--glass-text-primary)]">{t('signinHeroProjectTitle')}</div>
                <div className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">{t('signinHeroProjectDescription')}</div>
              </div>
              <div className="studio-media-frame p-5">
                <div className="studio-section-title text-[10px] text-[var(--glass-text-tertiary)]">{t('signinHeroStyleLabel')}</div>
                <div className="mt-3 text-xl font-semibold text-[var(--glass-text-primary)]">{t('signinHeroStyleTitle')}</div>
                <div className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">{t('signinHeroStyleDescription')}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="glass-surface-modal p-8 md:p-9">
            <div className="mb-8 text-center">
              <div className="studio-kicker mx-auto w-fit">{t('signinPanelKicker')}</div>
              <h1 className="mt-5 text-3xl font-bold text-[var(--glass-text-primary)] md:text-4xl">
                {t('welcomeBack')}
              </h1>
              <p className="mt-2 text-[var(--glass-text-secondary)]">{t('loginTo')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="username" className="glass-field-label block mb-2">
                  {t('phoneNumber')}
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="glass-input-base w-full px-4 py-3"
                  placeholder={t('phoneNumberPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="password" className="glass-field-label block mb-2">
                  {t('password')}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input-base w-full px-4 py-3"
                  placeholder={t('passwordPlaceholder')}
                />
              </div>

              {error && (
                <div className="bg-[var(--glass-tone-danger-bg)] border border-[color:color-mix(in_srgb,var(--glass-tone-danger-fg)_22%,transparent)] text-[var(--glass-tone-danger-fg)] px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="glass-btn-base glass-btn-primary w-full py-3.5 px-4 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('loginButtonLoading') : t('loginButton')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-[var(--glass-text-secondary)]">
                {t('noAccount')}{" "}
                <Link href={{ pathname: '/auth/signup' }} className="text-[var(--glass-tone-info-fg)] hover:underline font-medium">
                  {t('signupNow')}
                </Link>
              </p>
            </div>

            <div className="mt-6 text-center">
              <Link href={{ pathname: '/' }} className="text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)] text-sm">
                {t('backToHome')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
