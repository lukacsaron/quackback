import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWithApiKeyAuth = vi.fn()
const mockGetSubscribedPosts = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
}))
vi.mock('@/lib/server/domains/subscriptions/subscription.service', () => ({
  getMemberSubscribedPosts: (...args: unknown[]) => mockGetSubscribedPosts(...args),
}))

import { Route } from '../$principalId.subscriptions'
import { PERMISSIONS } from '@/lib/shared/permissions'

type RouteOpts = { server: { handlers: { GET: (...args: unknown[]) => Promise<Response> } } }
const GET = (Route as unknown as { options: RouteOpts }).options.server.handlers.GET

const PRINCIPAL = 'principal_01kqhxq697fvgat0fvps13rmy2'

function call(principalId: string): Promise<Response> {
  return GET({
    request: new Request(`http://test/api/v1/users/${principalId}/subscriptions`),
    params: { principalId },
  })
}

describe('GET /api/v1/users/:principalId/subscriptions', () => {
  beforeEach(() => {
    mockWithApiKeyAuth.mockReset()
    mockGetSubscribedPosts.mockReset()
    mockWithApiKeyAuth.mockResolvedValue({ principalId: 'principal_key', role: 'admin' })
  })

  it('requires people.view and returns the subscribed posts in the data envelope', async () => {
    mockGetSubscribedPosts.mockResolvedValue([
      {
        id: 'post_1',
        title: 'Dark mode',
        statusId: 'post_status_1',
        statusName: 'Planned',
        boardId: 'board_1',
        boardSlug: 'ideas',
        boardName: 'Ideas',
        voteCount: 7,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        subscribedAt: new Date('2026-10-02T00:00:00.000Z'),
        reason: 'manual',
        notifyComments: true,
        notifyStatusChanges: true,
      },
    ])

    const res = await call(PRINCIPAL)

    expect(mockWithApiKeyAuth.mock.calls[0][1]).toEqual({ permission: PERMISSIONS.PEOPLE_VIEW })
    expect(mockGetSubscribedPosts).toHaveBeenCalledWith(PRINCIPAL)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: [
        {
          id: 'post_1',
          title: 'Dark mode',
          statusId: 'post_status_1',
          statusName: 'Planned',
          boardId: 'board_1',
          boardSlug: 'ideas',
          boardName: 'Ideas',
          voteCount: 7,
          createdAt: '2026-10-01T00:00:00.000Z',
          subscribedAt: '2026-10-02T00:00:00.000Z',
          reason: 'manual',
          notifyComments: true,
          notifyStatusChanges: true,
        },
      ],
    })
  })

  it('returns an empty list for a user with no subscriptions', async () => {
    mockGetSubscribedPosts.mockResolvedValue([])
    const res = await call(PRINCIPAL)
    expect(await res.json()).toEqual({ data: [] })
  })

  it('rejects a malformed principal id without querying', async () => {
    const res = await call('nope')
    expect(res.status).toBe(400)
    expect(mockGetSubscribedPosts).not.toHaveBeenCalled()
  })
})
