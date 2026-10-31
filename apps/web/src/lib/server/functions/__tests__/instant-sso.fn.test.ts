/**
 * Loop-safety and happy-path coverage for resolveInstantSsoRedirectFn.
 *
 * Uses the same createServerFn capture pattern as other suites in this
 * directory: the builder is mocked so the registered handler is pushed
 * onto `handlers` and driven directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

type AnyHandler = (args: { data: Record<string, unknown> }) => Promise<unknown>
const handlers: AnyHandler[] = []

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain = {
      validator() {
        return chain
      },
      handler(fn: AnyHandler) {
        handlers.push(fn)
        return chain
      },
    }
    return chain
  },
}))

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => new Headers(),
}))

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPublicAuthConfig: vi.fn(),
  // Default: no delegated sign-in configured.
  getPublicPortalConfig: vi.fn(async () => ({})),
  isSignInMethodEnabled: vi.fn(),
  getRegisteredOidcProviderIds: vi.fn(),
  getRegisteredAuthProviders: vi.fn(),
  signInSocial: vi.fn(),
}))

vi.mock('@/lib/server/auth/session', () => ({
  getSession: hoisted.getSession,
}))

vi.mock('@/lib/server/domains/settings/settings.service', () => ({
  getPublicAuthConfig: hoisted.getPublicAuthConfig,
  getPublicPortalConfig: hoisted.getPublicPortalConfig,
}))

vi.mock('@/lib/shared/signin-methods', () => ({
  isSignInMethodEnabled: hoisted.isSignInMethodEnabled,
}))

vi.mock('@/lib/server/auth/registered-providers', () => ({
  getRegisteredOidcProviderIds: hoisted.getRegisteredOidcProviderIds,
  getRegisteredAuthProviders: hoisted.getRegisteredAuthProviders,
}))

vi.mock('@/lib/server/auth', () => ({
  auth: {
    api: {
      signInSocial: hoisted.signInSocial,
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

await import('../instant-sso')

const resolveHandler = handlers[0]
if (typeof resolveHandler !== 'function') {
  throw new Error(
    `resolveInstantSsoRedirectFn handler not found at index 0 — found ${handlers.length} handlers`
  )
}

/** Configure the mocks for a sole-OIDC workspace (one registered provider, no
 *  other method) seen by an anonymous visitor. */
function soleOidcWorkspace(over?: {
  oidcIds?: string[]
  allIds?: string[]
  oauth?: Record<string, boolean>
}) {
  const oauth = over?.oauth ?? { password: false, magicLink: false }
  hoisted.getSession.mockResolvedValueOnce(null)
  hoisted.getRegisteredOidcProviderIds.mockResolvedValueOnce(
    new Set(over?.oidcIds ?? ['oidc_acme'])
  )
  hoisted.getRegisteredAuthProviders.mockResolvedValueOnce(over?.allIds ?? ['oidc_acme'])
  hoisted.getPublicAuthConfig.mockResolvedValueOnce({ oauth, openSignup: false })
  // isSignInMethodEnabled is real logic — default to matching the oauth shape
  hoisted.isSignInMethodEnabled.mockImplementation(
    (_oauth: Record<string, boolean | undefined> | undefined, key: string) => {
      if (key === 'password') return (oauth.password ?? true) !== false
      return oauth[key] === true
    }
  )
}

describe('resolveInstantSsoRedirectFn', () => {
  it('(a) returns null without calling signInSocial when a non-anonymous user is signed in', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { principalType: 'user', id: 'user_1', email: 'alice@example.com' },
    })

    const result = await resolveHandler({ data: {} })

    expect(result).toBeNull()
    expect(hoisted.signInSocial).not.toHaveBeenCalled()
  })

  it('(b) redirects to the sole registered OIDC provider for an anonymous visitor', async () => {
    soleOidcWorkspace()
    hoisted.signInSocial.mockResolvedValueOnce({ url: 'https://idp.example.com/auth' })

    const result = await resolveHandler({ data: { callbackUrl: '/portal' } })

    expect(result).toEqual({ url: 'https://idp.example.com/auth' })
    expect(hoisted.signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ provider: 'oidc_acme', disableRedirect: true }),
      })
    )
  })

  it('(c) returns null when a built-in email method is still enabled', async () => {
    soleOidcWorkspace({ oauth: { password: true, magicLink: false } })

    const result = await resolveHandler({ data: {} })

    expect(result).toBeNull()
    expect(hoisted.signInSocial).not.toHaveBeenCalled()
  })

  it('(d) returns null when a social provider is also registered', async () => {
    soleOidcWorkspace({ oidcIds: ['oidc_acme'], allIds: ['oidc_acme', 'google'] })

    const result = await resolveHandler({ data: {} })

    expect(result).toBeNull()
    expect(hoisted.signInSocial).not.toHaveBeenCalled()
  })

  it('(e) returns null when more than one IdP is registered (the user has a choice)', async () => {
    soleOidcWorkspace({ oidcIds: ['oidc_a', 'oidc_b'], allIds: ['oidc_a', 'oidc_b'] })

    const result = await resolveHandler({ data: {} })

    expect(result).toBeNull()
    expect(hoisted.signInSocial).not.toHaveBeenCalled()
  })

  it('(f) reads unified authConfig: sole OIDC + password/magicLink OFF => redirects', async () => {
    soleOidcWorkspace({ oauth: { password: false, magicLink: false } })
    hoisted.signInSocial.mockResolvedValueOnce({ url: 'https://idp.example.com/sso' })

    const result = await resolveHandler({ data: {} })

    expect(result).toEqual({ url: 'https://idp.example.com/sso' })
    expect(hoisted.getPublicAuthConfig).toHaveBeenCalled()
  })

  it('(g) reads unified authConfig: sole OIDC + password ON => null', async () => {
    soleOidcWorkspace({ oauth: { password: true, magicLink: false } })

    const result = await resolveHandler({ data: {} })

    expect(result).toBeNull()
    expect(hoisted.signInSocial).not.toHaveBeenCalled()
  })
})

describe('resolveInstantSsoRedirectFn with portalConfig.externalSignInUrl', () => {
  const EXTERNAL = 'https://app.example.com/api/feedback/sso'

  it('sends an anonymous portal sign-in to the external URL with an encoded relative returnTo', async () => {
    hoisted.getSession.mockResolvedValueOnce(null)
    hoisted.getPublicPortalConfig.mockResolvedValueOnce({ externalSignInUrl: EXTERNAL })

    const result = await resolveHandler({ data: { callbackUrl: '/b/ideas?sort=top' } })

    expect(result).toEqual({
      url: `${EXTERNAL}?returnTo=%2Fb%2Fideas%3Fsort%3Dtop`,
    })
    expect(hoisted.signInSocial).not.toHaveBeenCalled()
  })

  it('never delegates the team login (callbackUrl /admin)', async () => {
    soleOidcWorkspace({ oauth: { password: true, magicLink: false } })
    hoisted.getPublicPortalConfig.mockResolvedValueOnce({ externalSignInUrl: EXTERNAL })

    const result = await resolveHandler({ data: { callbackUrl: '/admin' } })

    expect(result).toBeNull()
  })

  it('replaces an unsafe callbackUrl with /', async () => {
    hoisted.getSession.mockResolvedValueOnce(null)
    hoisted.getPublicPortalConfig.mockResolvedValueOnce({ externalSignInUrl: EXTERNAL })

    const result = await resolveHandler({ data: { callbackUrl: '//evil.example' } })

    expect(result).toEqual({ url: `${EXTERNAL}?returnTo=%2F` })
  })

  it('does not redirect a signed-in visitor', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { principalType: 'user', id: 'user_1', email: 'alice@example.com' },
    })
    hoisted.getPublicPortalConfig.mockResolvedValue({ externalSignInUrl: EXTERNAL })

    const result = await resolveHandler({ data: { callbackUrl: '/b/ideas' } })

    expect(result).toBeNull()
    hoisted.getPublicPortalConfig.mockResolvedValue({})
  })

  it('without the setting, behaviour is unchanged (password on => null)', async () => {
    soleOidcWorkspace({ oauth: { password: true, magicLink: false } })

    const result = await resolveHandler({ data: { callbackUrl: '/b/ideas' } })

    expect(result).toBeNull()
  })
})
