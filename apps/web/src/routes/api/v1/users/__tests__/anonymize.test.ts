import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError } from '@/lib/shared/errors'

const mockWithApiKeyAuth = vi.fn()
const mockAnonymize = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
}))
vi.mock('@/lib/server/domains/users/user.service', () => ({
  anonymizePortalUser: (...args: unknown[]) => mockAnonymize(...args),
}))

import { Route } from '../$principalId.anonymize'
import { PERMISSIONS } from '@/lib/shared/permissions'

type RouteOpts = { server: { handlers: { POST: (...args: unknown[]) => Promise<Response> } } }
const POST = (Route as unknown as { options: RouteOpts }).options.server.handlers.POST

const PRINCIPAL = 'principal_01kqhxq697fvgat0fvps13rmy2'

function call(principalId: string): Promise<Response> {
  return POST({
    request: new Request(`http://test/api/v1/users/${principalId}/anonymize`, { method: 'POST' }),
    params: { principalId },
  })
}

describe('POST /api/v1/users/:principalId/anonymize', () => {
  beforeEach(() => {
    mockWithApiKeyAuth.mockReset()
    mockAnonymize.mockReset()
    mockWithApiKeyAuth.mockResolvedValue({ principalId: 'principal_key', role: 'admin' })
    mockAnonymize.mockResolvedValue(undefined)
  })

  it('requires people.manage and returns the principal id in the data envelope', async () => {
    const res = await call(PRINCIPAL)
    expect(mockWithApiKeyAuth.mock.calls[0][1]).toEqual({ permission: PERMISSIONS.PEOPLE_MANAGE })
    expect(mockAnonymize).toHaveBeenCalledWith(PRINCIPAL)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { principalId: PRINCIPAL } })
  })

  it('returns 404 when the portal user does not exist', async () => {
    mockAnonymize.mockRejectedValue(new NotFoundError('MEMBER_NOT_FOUND', 'nope'))
    const res = await call(PRINCIPAL)
    expect(res.status).toBe(404)
  })

  it('rejects a malformed principal id without calling the service', async () => {
    const res = await call('not-a-principal')
    expect(res.status).toBe(400)
    expect(mockAnonymize).not.toHaveBeenCalled()
  })

  it('does not anonymise when the key is refused', async () => {
    mockWithApiKeyAuth.mockRejectedValue(new Error('forbidden'))
    const res = await call(PRINCIPAL)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(mockAnonymize).not.toHaveBeenCalled()
  })
})
