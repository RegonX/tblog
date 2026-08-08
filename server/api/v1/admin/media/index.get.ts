import { getQuery, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createMediaServiceForEvent } from '../../../../services/media-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { adminMediaListQuerySchema } from '../../../../validation/media-input'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const query = adminMediaListQuerySchema.parse(getQuery(event))
    const page = await createMediaServiceForEvent(event).list(query, current.permissions)

    return ok(page.items, {
      total: page.total,
      offset: page.offset,
      limit: page.limit
    })
  } catch (error) {
    const mapped =
      error instanceof ZodError
        ? new DomainError('validation_failed', 'Invalid media query', 422, { issues: error.issues })
        : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
