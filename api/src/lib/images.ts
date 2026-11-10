import type { ImageType } from './types'

/** The first bytes each allowed type starts with, so an upload is the image it says it is. */
export function looksLike(contentType: ImageType, data: string): boolean {
  const head = Buffer.from(data.slice(0, 24), 'base64')
  if (contentType === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  if (contentType === 'image/png') return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP'
}
