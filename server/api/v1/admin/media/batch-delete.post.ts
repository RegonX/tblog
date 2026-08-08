import { readBody, setResponseStatus } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { createMediaServiceForEvent } from '../../../../services/media-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { batchDeleteMediaInputSchema } from '../../../../validation/media-input'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const input = batchDeleteMediaInputSchema.parse(await readBody(event))
    const result = await createMediaServiceForEvent(event).removeMany(
      input.ids,
      { force: input.force },
      current.permissions
    )
    return ok(result)
  } catch (error) {
    const mapped = error instanceof ZodError
      ? new DomainError('validation_failed', 'Invalid batch media delete request', 422, { issues: error.issues })
      : error
    const response = errorResponse(event, mapped)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
