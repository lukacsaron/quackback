/**
 * getPortalUserDetail engaged posts (TTMT fork, fix-delta F2-4, the rest of L17).
 *
 * With `portalVisibleOnly`, every post query feeding `engagedPosts` (authored,
 * commented, voted, and the follow-up fetch of the commented/voted posts) holds
 * only posts the portal would show this member: published or their own pending,
 * not a merged duplicate, not on a deleted board. Without the option (the admin
 * people page and inbox panel) nothing is narrowed.
 *
 * Every query is captured and its predicates rendered with drizzle's real
 * Postgres dialect, so the assertions read the SQL that would run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createId, type PrincipalId } from '@quackback/ids'

type Captured = { table: unknown; fields: string[]; predicates: SQL[] }
const captured: Captured[] = []
const tables = vi.hoisted(() => ({
  rows: new Map<unknown, (c: { fields: string[] }) => unknown[]>(),
}))

vi.mock('@/lib/server/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/server/db')>()
  const select = (fields?: Record<string, unknown>) => {
    const c: Captured = { table: undefined, fields: Object.keys(fields ?? {}), predicates: [] }
    captured.push(c)
    const chain: Record<string, unknown> = {
      from: (t: unknown) => {
        c.table = t
        return chain
      },
      innerJoin: (_t: unknown, on: SQL) => {
        c.predicates.push(on)
        return chain
      },
      leftJoin: () => chain,
      where: (cond: SQL) => {
        c.predicates.push(cond)
        return chain
      },
      groupBy: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(tables.rows.get(c.table)?.(c) ?? []).then(resolve, reject),
    }
    return chain
  }
  return { ...real, db: { select } }
})

import { principal, posts, postComments, postVotes, session, visitorDevices } from '@/lib/server/db'
import { getPortalUserDetail } from '../user.detail'

const PRINCIPAL = 'principal_01kqhxq697fvgat0fvps13rmy2' as unknown as PrincipalId
const dialect = new PgDialect()

function sqlOf(c: Captured): string {
  return c.predicates.map((p) => dialect.sqlToQuery(p).sql).join(' AND ')
}

beforeEach(() => {
  captured.length = 0
  tables.rows.clear()
  tables.rows.set(principal, () => [
    {
      principalId: PRINCIPAL,
      userId: createId('user'),
      name: 'Pat',
      email: 'pat@example.com',
      role: 'user',
      principalType: 'user',
      joinedAt: new Date(),
      createdAt: new Date(),
    },
  ])
  // A comment and a vote on posts the user did not write, so the follow-up
  // fetch of "other" posts runs too.
  tables.rows.set(postComments, (c) =>
    c.fields.includes('latestCommentAt')
      ? [{ postId: createId('post'), latestCommentAt: new Date() }]
      : []
  )
  tables.rows.set(postVotes, () => [{ postId: createId('post'), votedAt: new Date() }])
  tables.rows.set(session, () => [{ v: null }])
  tables.rows.set(visitorDevices, () => [{ v: null }])
})

const VISIBLE = [
  '"posts"."deleted_at" is null',
  '"posts"."canonical_post_id" is null',
  '"boards"."deleted_at" is null',
  '"posts"."moderation_state" = $',
]

function engagementQueries() {
  const postQueries = captured.filter((c) => c.table === posts)
  return {
    authored: postQueries.find((c) => !sqlOf(c).includes(' in (')),
    other: postQueries.find((c) => sqlOf(c).includes(' in (')),
    commented: captured.find(
      (c) => c.table === postComments && c.fields.includes('latestCommentAt')
    ),
    voted: captured.find((c) => c.table === postVotes),
  }
}

describe('getPortalUserDetail with portalVisibleOnly (TTMT API path)', () => {
  it.each(['authored', 'commented', 'voted', 'other'] as const)(
    'the %s query keeps only portal-visible posts',
    async (kind) => {
      await getPortalUserDetail(PRINCIPAL, { portalVisibleOnly: true })
      const q = engagementQueries()[kind]
      expect(q, `${kind} query ran`).toBeTruthy()
      const sql = sqlOf(q!)
      for (const fragment of VISIBLE) expect(sql).toContain(fragment)
      // The member's own pending posts stay.
      expect(sql).toMatch(/"posts"\."moderation_state" = \$\d+ and "posts"\."principal_id" = \$\d+/)
    }
  )
})

describe('getPortalUserDetail without the option (admin people page, inbox panel)', () => {
  it.each(['authored', 'commented', 'voted', 'other'] as const)(
    'the %s query is not narrowed',
    async (kind) => {
      await getPortalUserDetail(PRINCIPAL)
      const sql = sqlOf(engagementQueries()[kind]!)
      expect(sql).toContain('"posts"."deleted_at" is null')
      expect(sql).not.toContain('moderation_state')
      expect(sql).not.toContain('canonical_post_id')
    }
  )
})
