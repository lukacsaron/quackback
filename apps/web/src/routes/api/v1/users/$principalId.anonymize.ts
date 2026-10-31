import { createFileRoute } from '@tanstack/react-router'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { PERMISSIONS } from '@/lib/shared/permissions'
import type { PrincipalId } from '@quackback/ids'

export const Route = createFileRoute('/api/v1/users/$principalId/anonymize')({
  server: {
    handlers: {
      /**
       * POST /api/v1/users/:principalId/anonymize
       * Erase a portal user's personal data but keep their posts, comments and
       * votes (attributed to the now anonymous principal). Signs them out
       * everywhere and removes every sign-in method.
       */
      POST: async ({ request, params }) => {
        try {
          await withApiKeyAuth(request, { permission: PERMISSIONS.PEOPLE_MANAGE })

          const principalId = parseTypeId<PrincipalId>(
            params.principalId,
            'principal',
            'principal ID'
          )

          const { anonymizePortalUser } = await import('@/lib/server/domains/users/user.service')

          await anonymizePortalUser(principalId)

          return successResponse({ principalId })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
