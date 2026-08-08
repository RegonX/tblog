import { setResponseStatus } from 'h3'
import { createMediaServiceForEvent } from '../../../../services/media-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    return ok(await createMediaServiceForEvent(event).stats(current.permissions))
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
