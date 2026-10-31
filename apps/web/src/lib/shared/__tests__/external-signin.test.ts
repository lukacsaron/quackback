import { describe, expect, it } from 'vitest'
import {
  isAllowedExternalSignInUrl,
  resolveExternalSignInUrl,
  teammateHandoffLanding,
} from '../external-signin'

const EXTERNAL = 'https://app.example.com/api/feedback/sso'

describe('resolveExternalSignInUrl', () => {
  it('returns null when no external URL is configured', () => {
    expect(resolveExternalSignInUrl(undefined, '/b/ideas')).toBeNull()
    expect(resolveExternalSignInUrl(null, '/b/ideas')).toBeNull()
    expect(resolveExternalSignInUrl('', '/b/ideas')).toBeNull()
  })

  it('appends the relative portal path as an encoded returnTo', () => {
    expect(resolveExternalSignInUrl(EXTERNAL, '/b/ideas/posts/p1?x=1')).toBe(
      `${EXTERNAL}?returnTo=%2Fb%2Fideas%2Fposts%2Fp1%3Fx%3D1`
    )
  })

  it('keeps query params already on the external URL', () => {
    expect(resolveExternalSignInUrl(`${EXTERNAL}?src=qb`, '/')).toBe(
      `${EXTERNAL}?src=qb&returnTo=%2F`
    )
  })

  it('never sends an absolute or protocol-relative returnTo', () => {
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', undefined]) {
      expect(resolveExternalSignInUrl(EXTERNAL, bad)).toBe(`${EXTERNAL}?returnTo=%2F`)
    }
  })

  it('does not delegate team sign-in', () => {
    expect(resolveExternalSignInUrl(EXTERNAL, '/admin')).toBeNull()
    expect(resolveExternalSignInUrl(EXTERNAL, '/admin/feedback')).toBeNull()
    expect(resolveExternalSignInUrl(EXTERNAL, '/complete-signup/abc')).toBeNull()
  })

  it('ignores a malformed or non-http(s) URL', () => {
    expect(resolveExternalSignInUrl('not a url', '/')).toBeNull()
    expect(resolveExternalSignInUrl('javascript:alert(1)', '/')).toBeNull()
  })
})

describe('L20: team targets with a query or hash stay on Quackback', () => {
  it('does not delegate /admin?x=1 or /admin#top', () => {
    expect(resolveExternalSignInUrl(EXTERNAL, '/admin?x=1')).toBeNull()
    expect(resolveExternalSignInUrl(EXTERNAL, '/admin#top')).toBeNull()
    expect(resolveExternalSignInUrl(EXTERNAL, '/complete-signup?invite=1')).toBeNull()
  })

  it('still delegates a portal path that only starts with the same letters', () => {
    expect(resolveExternalSignInUrl(EXTERNAL, '/administrator')).not.toBeNull()
  })
})

describe('L20: only https (or http on this machine) is accepted', () => {
  it('accepts https and loopback http', () => {
    expect(isAllowedExternalSignInUrl(EXTERNAL)).toBe(true)
    expect(isAllowedExternalSignInUrl('http://localhost:3000/api/feedback/sso')).toBe(true)
    expect(isAllowedExternalSignInUrl('http://127.0.0.1:3000/sso')).toBe(true)
  })

  it('refuses plain http to another host', () => {
    expect(isAllowedExternalSignInUrl('http://app.example.com/sso')).toBe(false)
    expect(resolveExternalSignInUrl('http://app.example.com/sso', '/')).toBeNull()
  })
})

describe('L20: teammateHandoffLanding', () => {
  it('lands on the plain sign-in when portal sign-in is not delegated', () => {
    expect(teammateHandoffLanding('/b/ideas', undefined)).toEqual({
      to: '/',
      search: { auth: 'signin', callbackUrl: '/b/ideas' },
    })
  })

  it('adds the teammate error only when delegation would bounce the teammate out', () => {
    expect(teammateHandoffLanding('/b/ideas', EXTERNAL)).toEqual({
      to: '/',
      search: { auth: 'signin', callbackUrl: '/b/ideas', error: 'teammate_widget_handoff' },
    })
  })
})
