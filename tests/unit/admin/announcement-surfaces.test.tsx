import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}))

describe('announcement user surfaces', () => {
  it('keeps modal, workspace, and profile announcement surfaces wired to their API query', async () => {
    const [
      { AnnouncementModal },
      { WorkspaceAnnouncementNotice },
      { ProfileAnnouncementMessages },
    ] = await Promise.all([
      import('@/components/announcements/AnnouncementModal'),
      import('@/components/announcements/WorkspaceAnnouncementNotice'),
      import('@/components/announcements/ProfileAnnouncementMessages'),
    ])

    const markup = [
      renderToStaticMarkup(createElement(AnnouncementModal)),
      renderToStaticMarkup(createElement(WorkspaceAnnouncementNotice)),
      renderToStaticMarkup(createElement(ProfileAnnouncementMessages)),
    ].join('\n')

    expect(AnnouncementModal.toString()).toContain('surface=modal')
    expect(WorkspaceAnnouncementNotice.toString()).toContain('surface=workspace_notice')
    expect(ProfileAnnouncementMessages.toString()).toContain('surface=profile_message')
    expect(markup).not.toContain('createdBy')
    expect(markup).not.toContain('targetUserIds')
  })
})

