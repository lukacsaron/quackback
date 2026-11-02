/**
 * TTMT: GET /api/v1/roadmaps/:roadmapId/posts answers a request with no
 * credentials from the portal's anonymous view, so the marketing site can read
 * the public roadmap without holding an API key. A request that carries an
 * Authorization header keeps the keyed path unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateId } from '@quackback/ids'
import { NotFoundError, UnauthorizedError } from '@/lib/shared/errors'
import { ANONYMOUS_ACTOR } from '@/lib/server/policy/types'

const mockWithApiKeyAuth = vi.fn()
const mockGetRoadmapPosts = vi.fn()
const mockGetPublicRoadmapPosts = vi.fn()
const mockResolvePortalAccess = vi.fn()
const mockCheckRateLimit = vi.fn()

vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
}))
vi.mock('@/lib/server/domains/api/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: () => '203.0.113.7',
}))
vi.mock('@/lib/server/domains/roadmaps/roadmap.query', () => ({
  getRoadmapPosts: (...args: unknown[]) => mockGetRoadmapPosts(...args),
  getPublicRoadmapPosts: (...args: unknown[]) => mockGetPublicRoadmapPosts(...args),
}))
vi.mock('@/lib/server/functions/portal-access', () => ({
  resolvePortalAccessForRequest: (...args: unknown[]) => mockResolvePortalAccess(...args),
}))

const ROADMAP_ID = generateId('roadmap')

const PAGE = {
  items: [
    {
      id: 'post_1',
      title: 'Dark mode',
      voteCount: 12,
      commentCount: 4,
      statusId: 'post_status_1',
      eta: new Date('2026-12-01T00:00:00.000Z'),
      board: { id: 'board_1', name: 'Ideas', slug: 'ideas' },
    },
  ],
  total: 1,
  hasMore: false,
}

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>

async function get(query = '', headers: Record<string, string> = {}): Promise<Response> {
  const mod = await import('../$roadmapId.posts')
  const options = mod.Route.options as unknown as { server: { handlers: Record<string, Handler> } }
  const handler = options.server.handlers.GET
  const request = new Request(`http://test/api/v1/roadmaps/${ROADMAP_ID}/posts${query}`, {
    headers,
  })
  return handler({ request, params: { roadmapId: ROADMAP_ID } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWithApiKeyAuth.mockResolvedValue({ principalId: 'principal_test', role: 'admin' })
  mockGetRoadmapPosts.mockResolvedValue(PAGE)
  mockGetPublicRoadmapPosts.mockResolvedValue(PAGE)
  mockResolvePortalAccess.mockResolvedValue({ granted: true, reason: 'public' })
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 99 })
})

describe('GET /api/v1/roadmaps/:roadmapId/posts without credentials', () => {
  it('answers from the anonymous public view on a public portal', async () => {
    const res = await get()
    expect(res.status).toBe(200)

    expect(mockGetPublicRoadmapPosts).toHaveBeenCalledTimes(1)
    const [roadmapId, options, actor] = mockGetPublicRoadmapPosts.mock.calls[0]
    expect(roadmapId).toBe(ROADMAP_ID)
    expect(options).toEqual({ statusId: undefined, bucketId: undefined, limit: 20, offset: 0 })
    expect(actor).toBe(ANONYMOUS_ACTOR)
    expect(mockWithApiKeyAuth).not.toHaveBeenCalled()
    expect(mockGetRoadmapPosts).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1)

    const body = await res.json()
    expect(body.data.total).toBe(1)
    expect(body.data.hasMore).toBe(false)
    expect(Object.keys(body.data).sort()).toEqual(['hasMore', 'items', 'total'])
    const item = body.data.items[0]
    expect(Object.keys(item).sort()).toEqual(
      ['board', 'eta', 'id', 'statusId', 'title', 'voteCount'].sort()
    )
    expect(Object.keys(item.board).sort()).toEqual(['id', 'name', 'slug'])
    expect(item.eta).toBe('2026-12-01T00:00:00.000Z')
  })

  it('answers 404 when the roadmap is not viewable anonymously', async () => {
    mockGetPublicRoadmapPosts.mockRejectedValue(
      new NotFoundError('ROADMAP_NOT_FOUND', 'Roadmap not found')
    )
    const res = await get()
    expect(res.status).toBe(404)
  })

  it('answers 401 and does not query when the portal is not public', async () => {
    mockResolvePortalAccess.mockResolvedValue({ granted: false, reason: 'unauthenticated' })
    const res = await get()
    expect(res.status).toBe(401)
    expect(mockGetPublicRoadmapPosts).not.toHaveBeenCalled()
    expect(mockGetRoadmapPosts).not.toHaveBeenCalled()
  })

  it('answers 401 when access is granted for a reason other than a public portal', async () => {
    mockResolvePortalAccess.mockResolvedValue({ granted: true, reason: 'domain' })
    const res = await get()
    expect(res.status).toBe(401)
    expect(mockGetPublicRoadmapPosts).not.toHaveBeenCalled()
  })

  it('answers 429 and does not query when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 30 })
    const res = await get()
    expect(res.status).toBe(429)
    expect(mockGetPublicRoadmapPosts).not.toHaveBeenCalled()
  })

  it('caps limit at 100', async () => {
    const res = await get('?limit=500&offset=40')
    expect(res.status).toBe(200)
    const [, options] = mockGetPublicRoadmapPosts.mock.calls[0]
    expect(options.limit).toBe(100)
    expect(options.offset).toBe(40)
  })
})

describe('GET /api/v1/roadmaps/:roadmapId/posts with an Authorization header', () => {
  it('uses the keyed path unchanged', async () => {
    const res = await get('', { authorization: 'Bearer qb_test' })
    expect(res.status).toBe(200)
    expect(mockWithApiKeyAuth).toHaveBeenCalledTimes(1)
    expect(mockGetRoadmapPosts).toHaveBeenCalledTimes(1)
    expect(mockGetPublicRoadmapPosts).not.toHaveBeenCalled()
    expect(mockResolvePortalAccess).not.toHaveBeenCalled()
  })

  it('keeps a bad key a 401 even on a public portal', async () => {
    mockWithApiKeyAuth.mockRejectedValue(new UnauthorizedError('Invalid or missing API key'))
    const res = await get('', { authorization: 'Bearer qb_wrong' })
    expect(res.status).toBe(401)
    expect(mockGetPublicRoadmapPosts).not.toHaveBeenCalled()
  })

  it('caps limit at 100 on the keyed path', async () => {
    await get('?limit=500', { authorization: 'Bearer qb_test' })
    expect(mockGetRoadmapPosts.mock.calls[0][1].limit).toBe(100)
  })
})
