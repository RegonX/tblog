import { getRouterParam, isError, readBody, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { ZodError } from 'zod'
import { DomainError } from '../../../../domain/domain-error'
import { mediaError } from '../../../../domain/media-errors'
import { createMediaServiceForEvent } from '../../../../services/media-service-factory'
import { errorResponse, ok } from '../../../../utils/api-response'
import { requireAdmin } from '../../../../utils/require-admin'
import { mediaIdParamSchema, updateMediaMetadataInputSchema } from '../../../../validation/media-input'

function parseMediaId(value: string | undefined): string {
  try {
    return mediaIdParamSchema.parse(value)
  } catch {
    throw mediaError('media_not_found', 'Image was not found', 404)
  }
}

async function parseMetadataInput(event: H3Event) {
  try {
    return updateMediaMetadataInputSchema.parse(await readBody(event))
  } catch (error) {
    if (error instanceof ZodError || (isError(error) && error.statusCode === 400)) {
      throw new DomainError(
        'validation_failed',
        'Invalid media input',
        422,
        error instanceof ZodError ? { issues: error.issues } : {}
      )
    }

    throw error
  }
}

export default defineEventHandler(async (event) => {
  try {
    const current = await requireAdmin(event)
    const id = parseMediaId(getRouterParam(event, 'id'))
    const input = await parseMetadataInput(event)
    const result = await createMediaServiceForEvent(event).updateMetadata(
      id,
      { altText: input.altText, caption: input.caption },
      current.permissions
    )

    return ok(result)
  } catch (error) {
    const response = errorResponse(event, error)
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
