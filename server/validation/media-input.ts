import { z } from 'zod'
import { allowedMediaTypes, MAX_MEDIA_ALT_TEXT_BYTES, MAX_MEDIA_CAPTION_BYTES } from '../services/media-service'

/** Only date-only bounds are accepted so a filter cannot depend on the caller's clock or timezone. */
const dateBoundSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date filter must use the YYYY-MM-DD format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Date filter must be a valid calendar date')

export const adminMediaListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    contentType: z.enum(Object.keys(allowedMediaTypes) as [string, ...string[]]).optional(),
    from: dateBoundSchema.optional(),
    to: dateBoundSchema.optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(24)
  })
  .transform((query) => ({
    ...query,
    q: query.q || undefined,
    from: query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
    // Inclusive upper bound: everything recorded during the selected end day.
    to: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined
  }))
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'The start date must not be after the end date'
  })

export const updateMediaMetadataInputSchema = z.object({
  altText: z.string().max(MAX_MEDIA_ALT_TEXT_BYTES).nullable().optional().default(null),
  caption: z.string().max(MAX_MEDIA_CAPTION_BYTES).nullable().optional().default(null)
})

export const deleteMediaQuerySchema = z.object({
  // Deleting an image that content still references requires an explicit second confirmation.
  force: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
  .optional()
  .default(false)
})

export const batchDeleteMediaInputSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  force: z.boolean().optional().default(false)
})

export const mediaIdParamSchema = z.string().trim().min(1).max(200)

export type AdminMediaListQueryDto = z.infer<typeof adminMediaListQuerySchema>
export type UpdateMediaMetadataInputDto = z.infer<typeof updateMediaMetadataInputSchema>
export type BatchDeleteMediaInputDto = z.infer<typeof batchDeleteMediaInputSchema>
