import { buildSigninRedirect } from './auth-prompt'
import { isSafeCallbackUrl, isTeamCallback } from './routing'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Whether a configured external sign-in URL may be used: https, or plain http
 * only to this machine (local development). Anything else, including a value
 * that does not parse, is refused.
 */
export function isAllowedExternalSignInUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}

/** Team targets are matched on the path alone, so `/admin?x=1` stays a team target. */
function isTeamTarget(returnTo: string | undefined): boolean {
  if (!returnTo) return false
  return isTeamCallback(returnTo.split(/[?#]/, 1)[0])
}

/**
 * Where a PORTAL sign-in should go when the workspace delegates portal
 * sign-in to its own app (`portalConfig.externalSignInUrl`).
 *
 * Returns `<externalSignInUrl>?returnTo=<relative portal path>`, or null when
 * the native sign-in dialog should be used instead: no URL configured, a URL
 * that is not allowed (see isAllowedExternalSignInUrl), or a team target
 * (`/admin`, team invites) — staff always sign in through Quackback's own form.
 *
 * The external app is expected to sign the visitor in (widget identify →
 * one-time token → `/auth/widget-handoff?returnTo=…`) and so land them back
 * on `returnTo`. Only a relative path is ever sent; anything unsafe becomes `/`.
 */
export function resolveExternalSignInUrl(
  externalSignInUrl: string | null | undefined,
  returnTo: string | undefined
): string | null {
  if (!externalSignInUrl || !isAllowedExternalSignInUrl(externalSignInUrl)) return null
  if (isTeamTarget(returnTo)) return null
  const url = new URL(externalSignInUrl)
  url.searchParams.set('returnTo', isSafeCallbackUrl(returnTo) ? returnTo : '/')
  return url.toString()
}

/**
 * Where a teammate lands when the widget handoff refuses them. The
 * `teammate_widget_handoff` error is added only when portal sign-in is
 * delegated to an external app: there it keeps the teammate on Quackback's own
 * dialog (a plain landing would bounce them out to the external app and back).
 * Without delegation the landing is the plain sign-in, as upstream.
 */
export function teammateHandoffLanding(
  returnTo: string,
  externalSignInUrl: string | null | undefined
): ReturnType<typeof buildSigninRedirect> {
  return resolveExternalSignInUrl(externalSignInUrl, returnTo)
    ? buildSigninRedirect(returnTo, { error: 'teammate_widget_handoff' })
    : buildSigninRedirect(returnTo)
}
