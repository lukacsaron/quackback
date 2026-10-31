/**
 * Mocked-executor coverage for anonymizePortalUser: which tables are written,
 * with which values, and that authored content and votes are never touched.
 * The real-DB proof lives in anonymize-portal-user.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrincipalId, UserId } from '@quackback/ids'

type Write = { op: 'update' | 'delete'; table: unknown; set?: Record<string, unknown> }
const writes: Write[] = []
const mockFindFirst = vi.fn()

vi.mock('@/lib/server/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/server/db')>()
  const tx = {
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          writes.push({ op: 'update', table, set })
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        writes.push({ op: 'delete', table })
      },
    }),
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  }
  return {
    ...real,
    db: {
      query: { principal: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } },
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
    inArray: vi.fn(),
  }
})

vi.mock('@/lib/server/cache', () => ({
  cacheDel: vi.fn(),
  CACHE_KEYS: { PRINCIPAL_BY_USER: (id: string) => `principal:user:${id}` },
}))

import {
  account,
  channelIdentities,
  conversations,
  emailLog,
  oneTimeToken,
  tickets,
  widgetOriginSession,
  postComments,
  posts,
  postVotes,
  principal,
  session,
  twoFactor,
  user,
  widgetIdentifiedSession,
} from '@/lib/server/db'
import { anonymizePortalUser, ANONYMIZED_EMAIL_ADDRESS } from '../user.service'
import { NotFoundError } from '@/lib/shared/errors'

const PRINCIPAL = 'principal_01kqhxq697fvgat0fvps13rmy2' as unknown as PrincipalId
const USER = 'user_01kqhxq697fvgat0fvps13rmy3' as unknown as UserId

describe('anonymizePortalUser', () => {
  beforeEach(() => {
    writes.length = 0
    mockFindFirst.mockReset()
  })

  it('clears personal fields, deletes every sign-in route, and leaves content alone', async () => {
    mockFindFirst.mockResolvedValue({ id: PRINCIPAL, userId: USER, role: 'user' })

    await anonymizePortalUser(PRINCIPAL)

    const userWrite = writes.find((w) => w.op === 'update' && w.table === user)
    expect(userWrite?.set).toMatchObject({
      name: 'Deleted user',
      email: null,
      image: null,
      imageKey: null,
      metadata: null,
      country: null,
      locale: null,
      preferredLanguage: null,
      externalId: null,
    })
    const principalWrite = writes.find((w) => w.op === 'update' && w.table === principal)
    expect(principalWrite?.set).toMatchObject({
      displayName: 'Deleted user',
      avatarUrl: null,
      avatarKey: null,
      contactEmail: null,
    })
    expect(writes.find((w) => w.table === conversations)?.set).toEqual({ visitorEmail: null })

    const deleted = writes.filter((w) => w.op === 'delete').map((w) => w.table)
    expect(deleted).toEqual(
      expect.arrayContaining([session, account, twoFactor, widgetIdentifiedSession])
    )
    expect(deleted).not.toContain(principal)

    const touched = writes.map((w) => w.table)
    for (const table of [posts, postComments, postVotes]) {
      expect(touched).not.toContain(table)
    }
  })

  it('I6: deletes the email channel identities and redacts the email log address', async () => {
    mockFindFirst.mockResolvedValue({ id: PRINCIPAL, userId: USER, role: 'user' })

    await anonymizePortalUser(PRINCIPAL)

    expect(writes.find((w) => w.op === 'delete' && w.table === channelIdentities)).toBeTruthy()
    expect(writes.find((w) => w.op === 'update' && w.table === emailLog)?.set).toEqual({
      address: ANONYMIZED_EMAIL_ADDRESS,
    })
  })

  it('L18: drops the company link, widget origin markers, one-time tokens and ticket context', async () => {
    mockFindFirst.mockResolvedValue({ id: PRINCIPAL, userId: USER, role: 'user' })

    await anonymizePortalUser(PRINCIPAL)

    const principalWrite = writes.find((w) => w.op === 'update' && w.table === principal)
    expect(principalWrite?.set).toMatchObject({ companyId: null })
    const deleted = writes.filter((w) => w.op === 'delete').map((w) => w.table)
    expect(deleted).toEqual(expect.arrayContaining([widgetOriginSession, oneTimeToken]))
    expect(writes.find((w) => w.op === 'update' && w.table === tickets)?.set).toEqual({
      customAttributes: {},
    })
  })

  it('throws NotFoundError and writes nothing for an unknown or non-portal principal', async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(anonymizePortalUser(PRINCIPAL)).rejects.toBeInstanceOf(NotFoundError)
    expect(writes).toHaveLength(0)
  })
})
