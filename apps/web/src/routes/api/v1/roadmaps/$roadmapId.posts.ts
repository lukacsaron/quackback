import { createFileRoute } from '@tanstack/react-router'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import { checkRateLimit, getClientIp } from '@/lib/server/domains/api/rate-limit'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { ANONYMOUS_ACTOR } from '@/lib/server/policy/types'
import type { RoadmapId, PostStatusId } from '@quackback/ids'
import { RateLimitError, UnauthorizedError } from '@/lib/shared/errors'
import { toIsoStringOrNull } from '@/lib/shared/utils'

export const Route = createFileRoute('/api/v1/roadmaps/$roadmapId/posts')({
  server: {
    handlers: {
      /**
       * GET /api/v1/roadmaps/:roadmapId/posts
       * List posts in a roadmap
       */
      GET: async ({ request, params }) => {
        try {
          // TTMT: public roadmap read for the marketing site without a key;
          // mirrors the portal's anonymous view. A request with no
          // Authorization header is served only when the portal is public to
          // everyone, through getPublicRoadmapPosts as the anonymous actor
          // (roadmap visibility, board audience, moderation). Any
          // Authorization header takes the keyed path below, unchanged.
          const anonymous = !request.headers.get('authorization')
          if (anonymous) {
            const rateLimit = await checkRateLimit(getClientIp(request))
            if (!rateLimit.allowed) throw new RateLimitError(rateLimit.retryAfter ?? 60)
            const { resolvePortalAccessForRequest } =
              await import('@/lib/server/functions/portal-access')
            const access = await resolvePortalAccessForRequest()
            if (!access.granted || access.reason !== 'public') {
              throw new UnauthorizedError(
                'Invalid or missing API key. Provide a valid key in the Authorization header: Bearer qb_xxx'
              )
            }
          } else {
            await withApiKeyAuth(request)
          }

          const roadmapId = parseTypeId<RoadmapId>(params.roadmapId, 'roadmap', 'roadmap ID')

          const url = new URL(request.url)
          const rawStatusId = url.searchParams.get('statusId')
          const statusId = rawStatusId
            ? parseTypeId<PostStatusId>(rawStatusId, 'post_status', 'status ID')
            : undefined
          const bucketId = url.searchParams.get('bucketId') ?? undefined
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100)
          const offset = parseInt(url.searchParams.get('offset') || '0', 10)

          const { getRoadmapPosts, getPublicRoadmapPosts } =
            await import('@/lib/server/domains/roadmaps/roadmap.query')

          const options = { statusId, bucketId, limit, offset }
          const result = anonymous
            ? await getPublicRoadmapPosts(roadmapId, options, ANONYMOUS_ACTOR)
            : await getRoadmapPosts(roadmapId, options)

          return successResponse({
            items: result.items.map((item) => ({
              id: item.id,
              title: item.title,
              voteCount: item.voteCount,
              statusId: item.statusId,
              eta: toIsoStringOrNull(item.eta),
              board: {
                id: item.board.id,
                name: item.board.name,
                slug: item.board.slug,
              },
            })),
            total: result.total,
            hasMore: result.hasMore,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
