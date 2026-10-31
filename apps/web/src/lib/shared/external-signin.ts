import { isSafeCallbackUrl, isTeamCallback } from './routing'

/**
 * Where a PORTAL sign-in should go when the workspace delegates portal
 * sign-in to its own app (`portalConfig.externalSignInUrl`).
 *
 * Returns `<externalSignInUrl>?returnTo=<relative portal path>`, or null when
 * the native sign-in dialog should be used instead: no URL configured, a
 * malformed or non-http(s) URL, or a team target (`/admin`, team invites) —
 * staff always sign in through Quackback's own form.
 *
 * The external app is expected to sign the visitor in (widget identify →
 * one-time token → `/auth/widget-handoff?returnTo=…`) and so land them back
 * on `returnTo`. Only a relative path is ever sent; anything unsafe becomes `/`.
 */
export function resolveExternalSignInUrl(
  externalSignInUrl: string | null | undefined,
  returnTo: string | undefined
): string | null {
  if (!externalSignInUrl) return null
  if (isTeamCallback(returnTo)) return null
  let url: URL
  try {
    url = new URL(externalSignInUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  url.searchParams.set('returnTo', isSafeCallbackUrl(returnTo) ? returnTo : '/')
  return url.toString()
}
