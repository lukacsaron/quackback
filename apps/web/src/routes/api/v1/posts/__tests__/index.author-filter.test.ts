import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrincipalId } from '@quackback/ids'

const mockWithApiKeyAuth = vi.fn()
const mockListInboxPosts = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
}))
vi.mock('@/lib/server/domains/posts/post.inbox', () => ({
  listInboxPosts: (...args: unknown[]) => mockListInboxPosts(...args),
}))
vi.mock('@/lib/server/domains/segments/segment-membership.service', () => ({
  segmentIdsForPrincipal: vi.fn(async () => new Set()),
}))

import { Route } from '../index'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

const AUTHOR = 'principal_01kqhxq697fvgat0fvps13rmy2' as unknown as PrincipalId

function makeRequest(query: string): Request {
  return new Request(`http://test/api/v1/posts${query}`, { method: 'GET' })
}

describe('GET /api/v1/posts author filter', () => {
  beforeEach(() => {
    mockWithApiKeyAuth.mockReset()
    mockListInboxPosts.mockReset()
    mockWithApiKeyAuth.mockResolvedValue({ principalId: 'principal_key', role: 'admin' })
    mockListInboxPosts.mockResolvedValue({ items: [], nextCursor: null, hasMore: false })
  })

  it('passes authorPrincipalId to listInboxPosts as authorId', async () => {
    const res = await GET({ request: makeRequest(`?authorPrincipalId=${AUTHOR}`) })
    expect(res.status).toBe(200)
    expect(mockListInboxPosts.mock.calls[0][0]).toMatchObject({ authorId: AUTHOR })
  })

  it('passes authorEmail to listInboxPosts', async () => {
    await GET({ request: makeRequest('?authorEmail=ada%40example.com') })
    expect(mockListInboxPosts.mock.calls[0][0]).toMatchObject({ authorEmail: 'ada@example.com' })
  })

  it('leaves both filters unset when neither param is given', async () => {
    await GET({ request: makeRequest('') })
    const params = mockListInboxPosts.mock.calls[0][0]
    expect(params.authorId).toBeUndefined()
    expect(params.authorEmail).toBeUndefined()
  })

  it('rejects a malformed authorPrincipalId instead of listing every post', async () => {
    const res = await GET({ request: makeRequest('?authorPrincipalId=not-a-principal') })
    expect(res.status).toBe(400)
    expect(mockListInboxPosts).not.toHaveBeenCalled()
  })
})
