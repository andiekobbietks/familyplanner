/**
 * A PDF becomes pages the same way photos do: each page is drawn to a canvas in the browser, then stored as a
 * JPEG like a photographed page (5.12). The original file isn't kept, so nothing else changes: the API, the
 * page viewer, the size cap and the CSP all stay as they are.
 *
 * pdf.js is loaded only when a PDF is chosen, so the rest of the app stays small. Its helper files are served
 * from /assets/pdfjs/ (see vite.config.ts), and it uses its plain JavaScript decoders rather than WebAssembly,
 * which the CSP doesn't allow.
 */

/** The longest side a PDF page is drawn at, the same as the largest photo step in images.ts. */
const PDF_EDGE = 2200

export const isPdf = (file: { type: string; name: string }) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

/** A starting title from the file's name: "Boiler_warranty-2021.pdf" → "Boiler warranty-2021". */
export const titleFromFileName = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)

/** Why a PDF can't be added, or undefined if its pages fit in what's left of the document. */
export function tooManyPages(pages: number, room: number, max: number): string | undefined {
  if (pages <= room) return undefined
  if (room <= 0) return `the document already has ${max} pages, the most it can hold`
  if (room >= max) return `it has ${pages} pages and a document holds ${max}`
  return `it has ${pages} pages and there's room for ${room} more (a document holds ${max})`
}

export interface OpenPdf {
  numPages: number
  /** Page `n` (from 1) drawn on a canvas. */
  render(n: number): Promise<HTMLCanvasElement>
  close(): void
}

export async function openPdf(file: Blob): Promise<OpenPdf> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const base = `${location.origin}/assets/pdfjs/`
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${base}cmaps/`,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    useWasm: false,
  })
  let doc: Awaited<typeof task.promise>
  try {
    doc = await task.promise
  } catch (e) {
    void task.destroy()
    throw new Error((e as Error).name === 'PasswordException' ? 'That PDF is password-protected' : "That file couldn't be opened as a PDF")
  }
  return {
    numPages: doc.numPages,
    async render(n) {
      const page = await doc.getPage(n)
      const natural = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: PDF_EDGE / Math.max(natural.width, natural.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      page.cleanup()
      return canvas
    },
    close: () => void task.destroy(),
  }
}
