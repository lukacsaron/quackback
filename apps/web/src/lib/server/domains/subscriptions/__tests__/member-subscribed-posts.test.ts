/**
 * getMemberSubscribedPosts (TTMT fork P3, review round 1 L17): the list must
 * hold only posts the portal would show this member. A post the portal hides
 * (spam, archived, closed, someone else's pending post, a merged duplicate, a
 * post on a deleted board) would link to a 404.
 *
 * The query builder is captured and its predicates rendered to SQL with the
 * real Postgres dialect, so the assertions read the SQL that would run.
 */
import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { PrincipalId } from '@quackback/ids'

const predicates: SQL[] = []

vi.mock('@/lib/server/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/server/db')>()
  const chain = {
    from: () => chain,
    innerJoin: (_t: unknown, on: SQL) => {
      predicates.push(on)
      return chain
    },
    leftJoin: () => chain,
    where: (cond: SQL) => {
      predicates.push(cond)
      return chain
    },
    orderBy: async () => [],
  }
  return { ...real, db: { select: () => chain } }
})

import { getMemberSubscribedPosts } from '../subscription.service'

const PRINCIPAL = 'principal_01kqhxq697fvgat0fvps13rmy2' as unknown as PrincipalId

async function renderedSql(): Promise<string> {
  predicates.length = 0
  await getMemberSubscribedPosts(PRINCIPAL)
  const dialect = new PgDialect()
  return predicates.map((p) => dialect.sqlToQuery(p).sql).join(' AND ')
}

describe('getMemberSubscribedPosts visibility (L17)', () => {
  it('keeps only published posts, or the member own pending posts', async () => {
    const sql = await renderedSql()
    expect(sql).toContain('"posts"."moderation_state" = $')
    expect(sql).toMatch(/"posts"\."moderation_state" = \$\d+ and "posts"\."principal_id" = \$\d+/)
  })

  it('drops merged duplicates and posts on deleted boards', async () => {
    const sql = await renderedSql()
    expect(sql).toContain('"posts"."canonical_post_id" is null')
    expect(sql).toContain('"boards"."deleted_at" is null')
  })

  it('still drops soft-deleted posts', async () => {
    const sql = await renderedSql()
    expect(sql).toContain('"posts"."deleted_at" is null')
  })
})
