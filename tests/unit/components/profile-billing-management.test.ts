import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProfilePage from '@/app/[locale]/profile/page'

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { name: 'Earth' } },
    status: 'authenticated',
  }),
  signOut: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      'common.loading': '加载中',
      'profile.user': '用户',
      'profile.personalAccount': '个人账户',
      'profile.availableBalance': '可用余额',
      'profile.openSourceNoBilling': '开源版本，无需计费',
      'profile.frozen': '冻结',
      'profile.totalSpent': '已消费',
      'profile.apiConfig': 'API 配置',
      'profile.billingRecords': '扣费记录',
      'profile.logout': '退出登录',
      'profile.balanceAfter': `余额 ${String(params?.amount ?? '')}`,
    }
    return messages[`${namespace}.${key}`] ?? `${namespace}.${key}`
  },
}))

vi.mock('@/components/Navbar', () => ({
  default: () => createElement('nav', null, 'Navbar'),
}))

vi.mock('@/app/[locale]/profile/components/ApiConfigTab', () => ({
  default: () => createElement('section', null, 'ApiConfigTab'),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, ...props }: { name: string } & Record<string, unknown>) =>
    createElement('span', { ...props, 'data-icon': name }),
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

describe('ProfilePage billing management', () => {
  it('renders the billing entry without the open-source placeholder', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(createElement(ProfilePage))

    expect(html).toContain('扣费记录')
    expect(html).toContain('可用余额')
    expect(html).not.toContain('开源版本，无需计费')
  })
})
