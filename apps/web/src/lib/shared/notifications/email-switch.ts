/**
 * TTMT: whether the "Email" switch for a notification type shows ON in the
 * preferences form.
 *
 * Same precedence as shouldNotify (server notification-matrix.ts) steps 2-4:
 * an explicit matrix entry, then the legacy boolean, then true. emailMuted is
 * left out because the form shows it as its own switch.
 *
 * Upstream read only the matrix and fell back to true, so a member whose
 * stored emailNewComment was false (an unsubscribe link, or the portal
 * default) saw the switch ON while no email was sent.
 *
 * Client-safe: no server imports.
 */
export interface EmailSwitchPrefs {
  emailNewComment: boolean
  emailStatusChange: boolean
  matrix?: Partial<Record<string, Partial<Record<'inApp' | 'email' | 'push', boolean>>>> | null
}

export function emailSwitchState(prefs: EmailSwitchPrefs, type: string): boolean {
  const explicit = prefs.matrix?.[type]?.email
  if (typeof explicit === 'boolean') return explicit
  if (type === 'comment_created') return prefs.emailNewComment
  if (type === 'post_status_changed') return prefs.emailStatusChange
  return true
}
