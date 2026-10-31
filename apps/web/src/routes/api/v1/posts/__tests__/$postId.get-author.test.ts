import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWithApiKeyAuth = vi.fn()
const mockGetPostWithDetails = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
  assertApiPermissions: vi.fn(),
}))
vi.mock('@/lib/server/domains/posts/post.query', () => ({
  getPostWithDetails: (...args: unknown[]) => mockGetPostWithDetails(...args),
}))
vi.mock('@/lib/server/domains/posts/post.merge', () => ({
  getMergedPosts: vi.fn(async () => []),
}))

import { Route } from '../$postId'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

const POST_ID = 'post_01kqhxq697fvgat0fvps13rmy2'
const AUTHOR = 'principal_01kqhxq697fvgat0fvps13rmy3'

function postFixture(principalId: string | null) {
  const now = new Date('2026-10-01T00:00:00.000Z')
  return {
    id: POST_ID,
    title: 'Dark mode',
    content: 'please',
    contentJson: null,
    voteCount: 3,
    commentCount: 0,
    boardId: 'board_1',
    board: { id: 'board_1', slug: 'ideas', name: 'Ideas' },
    statusId: null,
    principalId,
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    ownerPrincipalId: null,
    tags: [],
    pinnedComment: null,
    summaryJson: null,
    summaryUpdatedAt: null,
    canonicalPostId: null,
    mergedAt: null,
    isCommentsLocked: false,
    eta: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function call(): Promise<Response> {
  return GET({
    request: new Request(`http://test/api/v1/posts/${POST_ID}`),
    params: { postId: POST_ID },
  })
}

describe('GET /api/v1/posts/:postId authorPrincipalId', () => {
  beforeEach(() => {
    mockWithApiKeyAuth.mockReset()
    mockGetPostWithDetails.mockReset()
    mockWithApiKeyAuth.mockResolvedValue({ principalId: 'principal_key', role: 'admin' })
  })

  it("returns the author's principal id", async () => {
    mockGetPostWithDetails.mockResolvedValue(postFixture(AUTHOR))
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.authorPrincipalId).toBe(AUTHOR)
    expect(body.data.authorName).toBe('Ada')
  })

  it('returns null when the post has no author principal', async () => {
    mockGetPostWithDetails.mockResolvedValue(postFixture(null))
    const body = await (await call()).json()
    expect(body.data.authorPrincipalId).toBeNull()
  })
})
