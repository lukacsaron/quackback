/**
 * TTMT real-DB coverage: preference defaults depend on the principal's role
 * when no notification_preferences row exists, and a first save keeps the
 * role default for fields the caller did not send.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import { notificationPreferences, principal, user } from '@/lib/server/db'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

import {
  batchGetNotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../subscription.service'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: principal.id, role: principal.role }).from(principal).limit(0)
    await db
      .select({ id: notificationPreferences.id, matrix: notificationPreferences.matrix })
      .from(notificationPreferences)
      .limit(0)
  },
})

const runSuffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

async function seed(role: 'user' | 'admin' | 'member'): Promise<PrincipalId> {
  const userId = createId('user') as UserId
  const principalId = createId('principal') as PrincipalId
  await testDb
    .insert(user)
    .values({ id: userId, name: role, email: `${role}-${runSuffix()}@example.com` })
  await testDb.insert(principal).values({
    id: principalId,
    userId,
    role,
    type: 'user',
    displayName: role,
    createdAt: new Date(),
  })
  return principalId
}

describe.skipIf(!fixture.available)('role-aware notification preference defaults', () => {
  beforeEach(() => fixture.begin())
  afterEach(() => fixture.rollback())
  afterAll(() => fixture.close())

  it('getNotificationPreferences: user off, admin on', async () => {
    const u = await seed('user')
    const a = await seed('admin')
    expect((await getNotificationPreferences(u)).emailNewComment).toBe(false)
    expect((await getNotificationPreferences(a)).emailNewComment).toBe(true)
    expect((await getNotificationPreferences(u)).emailStatusChange).toBe(true)
  })

  it('batchGetNotificationPreferences: role defaults, stored rows win', async () => {
    const u = await seed('user')
    const m = await seed('member')
    const optedIn = await seed('user')
    await testDb.insert(notificationPreferences).values({
      principalId: optedIn,
      emailNewComment: true,
      emailStatusChange: true,
      emailMuted: false,
    })
    const map = await batchGetNotificationPreferences([u, m, optedIn])
    expect(map.get(u)?.emailNewComment).toBe(false)
    expect(map.get(m)?.emailNewComment).toBe(true)
    expect(map.get(optedIn)?.emailNewComment).toBe(true)
  })

  it('first save of another field keeps comment email off for a user', async () => {
    const u = await seed('user')
    const saved = await updateNotificationPreferences(u, { emailMuted: true })
    expect(saved.emailNewComment).toBe(false)
    expect(saved.emailMuted).toBe(true)
  })

  it('first save keeps comment email on for an admin', async () => {
    const a = await seed('admin')
    const saved = await updateNotificationPreferences(a, { emailStatusChange: false })
    expect(saved.emailNewComment).toBe(true)
  })
})
