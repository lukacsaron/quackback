/**
 * GET /api/v1/users/:principalId (TTMT fork, fix-delta F2-4): the API path TTMT
 * reads for "My requests" asks for portal-visible engaged posts only. The admin
 * people page and inbox panel call getPortalUserDetail without the option.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWithApiKeyAuth = vi.fn()
const mockGetDetail = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
}))
vi.mock('@/lib/server/domains/users/user.detail', () => ({
  getPortalUserDetail: (...args: unknown[]) => mockGetDetail(...args),
}))
vi.mock('@/lib/server/domains/users/user.attributes', () => ({
  parseUserAttributes: () => ({}),
}))

import { Route } from '../$principalId'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

const PRINCIPAL = 'principal_01kqhxq697fvgat0fvps13rmy2'

beforeEach(() => {
  mockWithApiKeyAuth.mockReset().mockResolvedValue({ principalId: 'principal_key', role: 'admin' })
  mockGetDetail.mockReset().mockResolvedValue({
    principalId: PRINCIPAL,
    userId: 'user_1',
    name: 'Pat',
    email: 'pat@example.com',
    image: null,
    emailVerified: true,
    metadata: null,
    joinedAt: new Date('2026-10-01T00:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    postCount: 0,
    commentCount: 0,
    voteCount: 0,
    engagedPosts: [],
  })
})

describe('GET /api/v1/users/:principalId engaged posts', () => {
  it('asks for portal-visible engaged posts only', async () => {
    const res = await GET({
      request: new Request(`http://test/api/v1/users/${PRINCIPAL}`),
      params: { principalId: PRINCIPAL },
    })
    expect(res.status).toBe(200)
    expect(mockGetDetail).toHaveBeenCalledWith(PRINCIPAL, { portalVisibleOnly: true })
  })
})
