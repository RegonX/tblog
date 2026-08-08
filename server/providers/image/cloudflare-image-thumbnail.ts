import {
  MEDIA_THUMBNAIL_CONTENT_TYPE,
  MEDIA_THUMBNAIL_QUALITY,
  MEDIA_THUMBNAIL_WIDTH
} from '../../services/media-service'

type ImagesBindingLike = CloudflareBindings['IMAGES']

/** Converts an uploaded image into the fixed derivative used by the media grid. */
export function createCloudflareImageThumbnail(images: ImagesBindingLike) {
  return async (bytes: Uint8Array): Promise<ArrayBuffer> => {
    const input = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    const source = new Response(input).body
    if (!source) throw new Error('Unable to create an image transformation stream')

    const output = await images
      .input(source)
      .transform({ width: MEDIA_THUMBNAIL_WIDTH, fit: 'scale-down' })
      .output({ format: MEDIA_THUMBNAIL_CONTENT_TYPE, quality: MEDIA_THUMBNAIL_QUALITY, anim: false })

    return new Response(output.image()).arrayBuffer()
  }
}
