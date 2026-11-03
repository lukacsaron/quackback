/**
 * TTMT: portal users get no "new comment" email by default; the team does.
 * The preferences form shows the same state the sender uses.
 */
import { describe, it, expect } from 'vitest'
import { defaultNotificationPreferences, shouldNotify } from '../notification-matrix'
import { emailSwitchState } from '@/lib/shared/notifications/email-switch'

describe('defaultNotificationPreferences', () => {
  it('portal user: no comment email, status email on', () => {
    const p = defaultNotificationPreferences('user')
    expect(shouldNotify(p, 'comment_created', 'email')).toBe(false)
    expect(shouldNotify(p, 'post_status_changed', 'email')).toBe(true)
    expect(shouldNotify(p, 'comment_mentioned', 'email')).toBe(true)
    expect(shouldNotify(p, 'comment_created', 'inApp')).toBe(true)
  })

  it('unknown role is treated as a portal user', () => {
    expect(defaultNotificationPreferences(null).emailNewComment).toBe(false)
    expect(defaultNotificationPreferences(undefined).emailNewComment).toBe(false)
  })

  it.each(['admin', 'member'])('%s keeps comment email on', (role) => {
    const p = defaultNotificationPreferences(role)
    expect(shouldNotify(p, 'comment_created', 'email')).toBe(true)
  })

  it('an explicit opt-in turns comment email back on', () => {
    const p = {
      ...defaultNotificationPreferences('user'),
      matrix: { comment_created: { email: true } },
    }
    expect(shouldNotify(p, 'comment_created', 'email')).toBe(true)
  })
})

describe('emailSwitchState', () => {
  it('shows the legacy boolean when the matrix has no entry', () => {
    const p = defaultNotificationPreferences('user')
    expect(emailSwitchState(p, 'comment_created')).toBe(false)
    expect(emailSwitchState(p, 'post_status_changed')).toBe(true)
    expect(emailSwitchState(p, 'comment_mentioned')).toBe(true)
  })

  it('an explicit matrix entry wins', () => {
    const p = {
      ...defaultNotificationPreferences('user'),
      matrix: { comment_created: { email: true } },
    }
    expect(emailSwitchState(p, 'comment_created')).toBe(true)
  })

  it('agrees with shouldNotify for every catalog type when not muted', () => {
    const types = ['comment_created', 'post_status_changed', 'post_mentioned', 'comment_mentioned']
    for (const role of ['user', 'admin']) {
      const p = defaultNotificationPreferences(role)
      for (const t of types) expect(emailSwitchState(p, t)).toBe(shouldNotify(p, t, 'email'))
    }
  })
})
