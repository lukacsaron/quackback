import { createFileRoute } from '@tanstack/react-router'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { PERMISSIONS } from '@/lib/shared/permissions'
import type { PrincipalId } from '@quackback/ids'

export const Route = createFileRoute('/api/v1/users/$principalId/subscriptions')({
  server: {
    handlers: {
      /**
       * GET /api/v1/users/:principalId/subscriptions
       * List the posts a user is subscribed to, newest subscription first.
       */
      GET: async ({ request, params }) => {
        try {
          await withApiKeyAuth(request, { permission: PERMISSIONS.PEOPLE_VIEW })

          const principalId = parseTypeId<PrincipalId>(
            params.principalId,
            'principal',
            'principal ID'
          )

          const { getMemberSubscribedPosts } =
            await import('@/lib/server/domains/subscriptions/subscription.service')

          const subscribed = await getMemberSubscribedPosts(principalId)

          return successResponse(
            subscribed.map((post) => ({
              id: post.id,
              title: post.title,
              statusId: post.statusId,
              statusName: post.statusName,
              boardId: post.boardId,
              boardSlug: post.boardSlug,
              boardName: post.boardName,
              voteCount: post.voteCount,
              createdAt: post.createdAt.toISOString(),
              subscribedAt: post.subscribedAt.toISOString(),
              reason: post.reason,
              notifyComments: post.notifyComments,
              notifyStatusChanges: post.notifyStatusChanges,
            }))
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
