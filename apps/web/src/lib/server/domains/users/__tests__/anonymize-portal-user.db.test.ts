/**
 * Real-DB coverage for anonymizePortalUser. Runs inside the db-test-fixture
 * rollback transaction (same harness as remove-portal-user.db.test.ts) and
 * skips when no test database is reachable.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { createId, type BoardId, type PostId, type PrincipalId, type UserId } from '@quackback/ids'
import { createDbTestFixture, testDb } from '@/lib/server/__tests__/db-test-fixture'
import {
  account,
  boards,
  channelIdentities,
  emailLog,
  eq,
  posts,
  postVotes,
  principal,
  session,
  user,
  widgetIdentifiedSession,
} from '@/lib/server/db'

vi.mock('@/lib/server/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: (await import('@/lib/server/__tests__/db-test-fixture')).testDb,
}))

vi.mock('@/lib/server/cache', () => ({
  cacheDel: vi.fn(),
  CACHE_KEYS: { PRINCIPAL_BY_USER: (id: string) => `principal:user:${id}` },
}))

import { anonymizePortalUser } from '../user.service'

const fixture = await createDbTestFixture({
  probe: async (db) => {
    await db.select({ id: principal.id, c: principal.contactEmail }).from(principal).limit(0)
    await db.select({ id: user.id, e: user.externalId }).from(user).limit(0)
    await db
      .select({ id: widgetIdentifiedSession.sessionId })
      .from(widgetIdentifiedSession)
      .limit(0)
    await db.select({ id: postVotes.id }).from(postVotes).limit(0)
    await db.select({ p: channelIdentities.principalId }).from(channelIdentities).limit(0)
    await db.select({ a: emailLog.address }).from(emailLog).limit(0)
  },
})

const runSuffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

describe.skipIf(!fixture.available)('anonymizePortalUser (real DB, rolled back)', () => {
  beforeEach(fixture.begin)
  afterEach(fixture.rollback)
  afterAll(fixture.close)

  it('removes the name and email everywhere and keeps the post and its vote', async () => {
    const name = `Erased Erin ${runSuffix()}`
    const email = `erin-${runSuffix()}@example.com`
    const userId = createId('user') as UserId
    const principalId = createId('principal') as PrincipalId
    await testDb.insert(user).values({ id: userId, name, email, externalId: `ext-${runSuffix()}` })
    await testDb.insert(principal).values({
      id: principalId,
      userId,
      role: 'user',
      type: 'user',
      displayName: name,
      contactEmail: email,
      createdAt: new Date(),
    })
    const sessionId = `sess-${runSuffix()}`
    await testDb.insert(session).values({
      id: sessionId,
      token: `tok-${runSuffix()}`,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      scope: 'widget',
      updatedAt: new Date(),
    })
    await testDb.insert(widgetIdentifiedSession).values({ sessionId, hmacVerified: true })
    await testDb.insert(account).values({
      accountId: email,
      providerId: 'credential',
      userId,
      password: 'x',
      updatedAt: new Date(),
    })

    await testDb
      .insert(channelIdentities)
      .values({ channel: 'email', externalId: email, principalId, verified: false })
    await testDb.insert(emailLog).values({
      direction: 'outbound',
      emailType: 'ticket_reply',
      principalId,
      address: email,
      status: 'sent',
    })

    const boardId = createId('board') as BoardId
    await testDb
      .insert(boards)
      .values({ id: boardId, slug: `anon-${runSuffix()}`, name: 'Anonymise fixture board' })
    const postId = createId('post') as PostId
    await testDb
      .insert(posts)
      .values({ id: postId, boardId, title: 'Keep me', content: 'c', principalId, voteCount: 1 })
    await testDb.insert(postVotes).values({ postId, principalId })

    await anonymizePortalUser(principalId)

    const [u] = await testDb.select().from(user).where(eq(user.id, userId))
    expect(u.name).toBe('Deleted user')
    expect(u.email).toBeNull()
    expect(u.externalId).toBeNull()
    expect(u.metadata).toBeNull()
    const [p] = await testDb.select().from(principal).where(eq(principal.id, principalId))
    expect(p.displayName).toBe('Deleted user')
    expect(p.contactEmail).toBeNull()
    expect(JSON.stringify([u, p])).not.toContain(email)
    expect(JSON.stringify([u, p])).not.toContain(name)

    expect(await testDb.select().from(session).where(eq(session.userId, userId))).toHaveLength(0)
    expect(await testDb.select().from(account).where(eq(account.userId, userId))).toHaveLength(0)
    expect(
      await testDb
        .select()
        .from(widgetIdentifiedSession)
        .where(eq(widgetIdentifiedSession.sessionId, sessionId))
    ).toHaveLength(0)

    expect(
      await testDb
        .select()
        .from(channelIdentities)
        .where(eq(channelIdentities.principalId, principalId))
    ).toHaveLength(0)
    const logs = await testDb.select().from(emailLog).where(eq(emailLog.principalId, principalId))
    expect(logs).toHaveLength(1)
    expect(logs[0].address).not.toContain(email)

    const [post] = await testDb.select().from(posts).where(eq(posts.id, postId))
    expect(post.principalId).toBe(principalId)
    expect(post.voteCount).toBe(1)
    expect(await testDb.select().from(postVotes).where(eq(postVotes.postId, postId))).toHaveLength(
      1
    )
  })
})
