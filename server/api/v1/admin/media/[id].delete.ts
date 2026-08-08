import { getQuery, getRouterParam, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { mediaError } from '../../../../domain/media-errors'
import { createMediaServiceForEvent } from '../../../../services/media-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { deleteMediaQuerySchema, mediaIdParamSchema } from '../../../../validation/media-input'

function parseMediaId(value: string | undefined): string {
  try {
    return mediaIdParamSchema.parse(value)
  } catch {
    throw mediaError('media_not_found', 'Image was not found', 404)
  }
}

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const id = parseMediaId(getRouterParam(event, 'id'))
    const query = deleteMediaQuerySchema.parse(getQuery(event))
    const result = await createMediaServiceForEvent(event).remove(
      id,
      { force: query.force },
      current.permissions
    )

    return ok(result)
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
