import { describe, expect, it } from 'vitest'
import { resolveExternalSignInUrl } from '../external-signin'

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
