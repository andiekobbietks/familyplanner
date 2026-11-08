import { describe, expect, it } from 'vitest'
import { isPdf, titleFromFileName, tooManyPages } from './pdf'

describe('PDF uploads', () => {
  it('knows a PDF by its type or, when a phone gives none, its name', () => {
    expect(isPdf({ type: 'application/pdf', name: 'scan' })).toBe(true)
    expect(isPdf({ type: '', name: 'Letter.PDF' })).toBe(true)
    expect(isPdf({ type: 'image/jpeg', name: 'IMG_0001.jpg' })).toBe(false)
  })

  it('suggests a title from the file name', () => {
    expect(titleFromFileName('Boiler_warranty-2021.pdf')).toBe('Boiler warranty-2021')
    expect(titleFromFileName('  Home   insurance.pdf')).toBe('Home insurance')
    expect(titleFromFileName('x'.repeat(300) + '.pdf')).toHaveLength(200)
  })

  it('refuses a PDF whose pages would take the document over its limit, before drawing any', () => {
    expect(tooManyPages(3, 50, 50)).toBeUndefined()
    expect(tooManyPages(50, 50, 50)).toBeUndefined()
    expect(tooManyPages(60, 50, 50)).toBe('it has 60 pages and a document holds 50')
    expect(tooManyPages(10, 4, 50)).toBe("it has 10 pages and there's room for 4 more (a document holds 50)")
    expect(tooManyPages(1, 0, 50)).toBe('the document already has 50 pages, the most it can hold')
  })
})
