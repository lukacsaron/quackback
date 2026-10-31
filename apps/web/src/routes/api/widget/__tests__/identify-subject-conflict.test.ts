/**
 * I5 (TTMT fork, review round 1): an email match that already carries a
 * DIFFERENT non-null external_id is another person's account (a recycled
 * address). Identify refuses with 409 SUBJECT_CONFLICT and never overwrites the
 * bound subject.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUserFindFirst = vi.fn()
const mockPrincipalFindFirst = vi.fn()
const mockSessionFindFirst = vi.fn()
const insertValues = vi.fn()
const updateSet = vi.fn()
const deletes: unknown[] = []
const calls: string[] = []
const mockVerifyJWT = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))

vi.mock('@/lib/server/db', async (importOriginal) => ({
  // Spread the real db module so tables/operators stay current; override only what this suite drives.
  ...(await importOriginal<typeof import('@/lib/server/db')>()),
  db: {
    query: {
      user: { findFirst: (...args: unknown[]) => mockUserFindFirst(...args) },
      session: { findFirst: (...args: unknown[]) => mockSessionFindFirst(...args) },
      principal: { findFirst: (...args: unknown[]) => mockPrincipalFindFirst(...args) },
      segments: { findFirst: vi.fn() },
    },
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v)
        const chain = {
          returning: async () => [{ id: 'inserted' }],
          onConflictDoUpdate: async () => undefined,
          onConflictDoNothing: () => chain,
        }
        return chain
      },
    }),
    update: () => ({
      set: (s: unknown) => {
        updateSet(s)
        calls.push('update')
        return { where: async () => undefined }
      },
    }),
    delete: (table: unknown) => ({
      where: async () => {
        deletes.push(table)
        calls.push('delete')
      },
    }),
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn((parts: TemplateStringsArray) => parts.raw[0]),
}))

vi.mock('@/lib/server/domains/settings/settings.widget', () => ({
  getWidgetConfig: vi.fn(async () => ({ enabled: true, identifyVerification: false })),
  getWidgetSecret: vi.fn(async () => 'secret'),
}))

vi.mock('@/lib/server/domains/posts/post.public', () => ({
  getAllUserVotedPostIds: vi.fn(async () => new Set()),
}))

vi.mock('@/lib/server/storage/s3', () => ({
  getPublicUrlOrNull: vi.fn(() => null),
}))

vi.mock('@/lib/server/auth/identify-merge', () => ({
  resolveAndMergeAnonymousToken: vi.fn(),
}))

vi.mock('@/lib/server/widget/identity-token', () => ({
  verifyHS256JWT: (...args: unknown[]) => mockVerifyJWT(...args),
}))

vi.mock('@/lib/server/domains/users/user.attributes', () => ({
  validateAndCoerceAttributes: vi.fn(async () => ({ valid: {}, removals: [], errors: [] })),
  mergeMetadata: vi.fn(() => null),
  EXTERNAL_ID_KEY: '_externalUserId',
}))

vi.mock('@/lib/server/domains/segments/segment-membership.service', () => ({
  addMember: vi.fn(async () => undefined),
  reconcileWidgetMemberships: vi.fn(async () => undefined),
}))

vi.mock('@quackback/ids', () => ({
  generateId: vi.fn((kind: string) => `${kind}_generated`),
}))

import { Route } from '../identify'

type RouteOpts = {
  server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } }
}
const { POST } = (Route as unknown as { options: RouteOpts }).options.server.handlers

function postIdentify(body: Record<string, unknown>): Promise<Response> {
  return POST({
    request: new Request('http://test/api/widget/identify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  deletes.length = 0
  calls.length = 0
  mockSessionFindFirst.mockResolvedValue(null)
})

describe('I5: an email match bound to a different subject', () => {
  it('refuses with 409 SUBJECT_CONFLICT and writes nothing', async () => {
    mockVerifyJWT.mockReturnValue({ sub: 'sub_b', email: 'shared@acme.com', name: 'B' })
    mockUserFindFirst
      .mockResolvedValueOnce(null) // external_id miss for sub_b
      .mockResolvedValueOnce({
        id: 'user_a',
        email: 'shared@acme.com',
        emailVerified: true,
        externalId: 'sub_a',
        name: 'A',
        image: null,
        metadata: null,
      }) // email hit: A's old account
    mockPrincipalFindFirst.mockResolvedValue({ id: 'principal_a', role: 'user' })

    const res = await postIdentify({ ssoToken: 'jwt' })

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error?: { code?: string } }
    expect(body.error?.code).toBe('SUBJECT_CONFLICT')
    expect(updateSet).not.toHaveBeenCalled()
    expect(deletes).toHaveLength(0)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('refuses a teammate row bound to a different subject too', async () => {
    mockVerifyJWT.mockReturnValue({ sub: 'sub_b', email: 'staff@acme.com', name: 'B' })
    mockUserFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_staff',
      email: 'staff@acme.com',
      emailVerified: true,
      externalId: 'sub_staff',
      name: 'Staff',
      image: null,
      metadata: null,
    })
    mockPrincipalFindFirst.mockResolvedValue({ id: 'principal_staff', role: 'admin' })

    const res = await postIdentify({ ssoToken: 'jwt' })

    expect(res.status).toBe(409)
    expect(insertValues).not.toHaveBeenCalled()
  })
})
