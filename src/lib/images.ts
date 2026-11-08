import type { DocPageImage, FamilyDocument } from '../api/types'

/** The API's caps (api/src/lib/schemas.ts), in base64 characters. */
export const PAGE_MAX_CHARS = 1_500_000
export const THUMB_MAX_CHARS = 60_000

/** Width and height scaled to fit within `max` on the longer side, never enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Tried in turn until the result fits: a page stays sharp enough to read small print. */
const PAGE_STEPS = [
  { edge: 2200, quality: 0.82 },
  { edge: 1800, quality: 0.75 },
  { edge: 1400, quality: 0.68 },
  { edge: 1100, quality: 0.6 },
]
const THUMB_STEPS = [
  { edge: 360, quality: 0.7 },
  { edge: 240, quality: 0.6 },
]

/**
 * Opens a photo as an image. Read as a data: URL because the site's Content-Security-Policy allows
 * only data: images, not blob: URLs.
 */
async function load(file: Blob): Promise<HTMLImageElement> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  try {
    const img = new Image()
    img.src = url
    // Browsers apply the photo's own rotation (EXIF) when drawing it, so a sideways phone photo comes out upright.
    await img.decode()
    return img
  } catch {
    throw new Error("That file couldn't be opened as a picture")
  }
}

function encode(img: HTMLImageElement, steps: { edge: number; quality: number }[], max: number): string {
  for (const { edge, quality } of steps) {
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, edge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const g = canvas.getContext('2d')!
    // A transparent PNG would turn black as a JPEG, so paper-white goes underneath.
    g.fillStyle = '#fff'
    g.fillRect(0, 0, width, height)
    g.drawImage(img, 0, 0, width, height)
    const data = canvas.toDataURL('image/jpeg', quality).slice('data:image/jpeg;base64,'.length)
    if (data.length <= max) return data
  }
  throw new Error('That picture is too large to store')
}

/**
 * A photo made ready to upload: a JPEG small enough to store (a few hundred KB), plus a thumbnail when asked.
 * Done in the browser, so a 5 MB phone photo isn't sent over a weak signal.
 */
export async function preparePhoto(file: Blob, withThumb = false): Promise<{ page: DocPageImage; thumb?: string }> {
  const img = await load(file)
  const page: DocPageImage = { contentType: 'image/jpeg', data: encode(img, PAGE_STEPS, PAGE_MAX_CHARS) }
  return withThumb ? { page, thumb: encode(img, THUMB_STEPS, THUMB_MAX_CHARS) } : { page }
}

export const dataUrl = (img: DocPageImage) => `data:${img.contentType};base64,${img.data}`

export const matchesDocument = (d: FamilyDocument, search: string) => {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const text = `${d.title} ${d.description}`.toLowerCase()
  return words.every((w) => text.includes(w))
}
