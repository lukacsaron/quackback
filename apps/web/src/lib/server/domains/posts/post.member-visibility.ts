/**
 * The posts the portal would show one member, as a SQL predicate (TTMT fork).
 *
 * Mirrors policy/posts.ts `canViewPost` for a member without
 * post.view_private: a published post, or the member's own pending post. On
 * top of that, the post and its board are not soft-deleted and the post is not
 * a merged duplicate (the portal does not list those). Board audience
 * (team-only or segment boards) is not checked: that needs a full actor.
 *
 * The caller must join `boards`.
 */
import { and, eq, isNull, or, posts, boards } from '@/lib/server/db'
import type { SQL } from 'drizzle-orm'
import type { PrincipalId } from '@quackback/ids'

export function memberVisiblePostFilter(principalId: PrincipalId): SQL {
  return and(
    isNull(posts.deletedAt),
    isNull(posts.canonicalPostId),
    isNull(boards.deletedAt),
    or(
      eq(posts.moderationState, 'published'),
      and(eq(posts.moderationState, 'pending'), eq(posts.principalId, principalId))
    )
  )!
}
