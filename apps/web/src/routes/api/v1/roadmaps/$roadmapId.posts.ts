import { createFileRoute } from '@tanstack/react-router'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import { checkRateLimit, getClientIp } from '@/lib/server/domains/api/rate-limit'
import { successResponse, handleDomainError } from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { ANONYMOUS_ACTOR } from '@/lib/server/policy/types'
import type { RoadmapId, PostStatusId } from '@quackback/ids'
import { RateLimitError, UnauthorizedError, ValidationError } from '@/lib/shared/errors'
import { toIsoString, toIsoStringOrNull } from '@/lib/shared/utils'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const MAX_OFFSET = 10_000
const DIGITS = /^[0-9]+$/

/**
 * TTMT: strict pagination. parseInt let `?limit=garbage` or `?limit=-2`
 * through as NaN or a negative number; Drizzle then dropped LIMIT and the
 * whole roadmap was read. Absent (or empty) means the default. Otherwise only
 * a base-10 digit string is accepted: limit >= 1 (above 100 is capped to
 * 100), offset 0..10000. Anything else is a 400 VALIDATION_ERROR.
 */
function parsePagination(url: URL): { limit: number; offset: number } {
  const rawLimit = url.searchParams.get('limit')
  const rawOffset = url.searchParams.get('offset')

  let limit = DEFAULT_LIMIT
  if (rawLimit) {
    const value = DIGITS.test(rawLimit) ? Number(rawLimit) : NaN
    if (!Number.isFinite(value) || value < 1) {
      throw new ValidationError('VALIDATION_ERROR', 'limit must be an integer from 1 to 100')
    }
    limit = Math.min(value, MAX_LIMIT)
  }

  let offset = 0
  if (rawOffset) {
    const value = DIGITS.test(rawOffset) ? Number(rawOffset) : NaN
    if (!Number.isFinite(value) || value > MAX_OFFSET) {
      throw new ValidationError('VALIDATION_ERROR', 'offset must be an integer from 0 to 10000')
    }
    offset = value
  }

  return { limit, offset }
}

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
          // Pagination is validated before any roadmap query on both paths;
          // on the anonymous path after the rate limiter (so garbage requests
          // count) and before the portal gate (cheap rejection first).
          const url = new URL(request.url)
          const anonymous = !request.headers.get('authorization')
          let pagination: { limit: number; offset: number }
          if (anonymous) {
            const rateLimit = await checkRateLimit(getClientIp(request))
            if (!rateLimit.allowed) throw new RateLimitError(rateLimit.retryAfter ?? 60)
            pagination = parsePagination(url)
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
            pagination = parsePagination(url)
          }

          const roadmapId = parseTypeId<RoadmapId>(params.roadmapId, 'roadmap', 'roadmap ID')

          const rawStatusId = url.searchParams.get('statusId')
          const statusId = rawStatusId
            ? parseTypeId<PostStatusId>(rawStatusId, 'post_status', 'status ID')
            : undefined
          const bucketId = url.searchParams.get('bucketId') ?? undefined
          const { limit, offset } = pagination

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
              // TTMT: when the post entered its current status (latest
              // status.changed activity, else the post's creation).
              statusChangedAt: toIsoString(item.statusChangedAt),
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
