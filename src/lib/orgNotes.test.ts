import { describe, expect, it } from 'vitest'
import { parseOrgNotes } from './orgNotes'

describe('parseOrgNotes', () => {
  it('makes one note per top-level heading, ignoring anything before the first', () => {
    const notes = parseOrgNotes('#+TITLE: Family notes\nIntro text\n* Wi-Fi\nPassword on the router\n* Bins\nBlue bin on Tuesdays')
    expect(notes).toEqual([
      { title: 'Wi-Fi', body: 'Password on the router' },
      { title: 'Bins', body: 'Blue bin on Tuesdays' },
    ])
  })

  it('takes the category from the CATEGORY property, else the first tag', () => {
    const notes = parseOrgNotes('* Boiler :appliances:house:\nAcme\n* No. 16 :neighbours:\n:PROPERTIES:\n:CATEGORY: Neighbours\n:END:\nMrs Patel\n* Front_door :Around_the_house:')
    expect(notes.map((n) => n.category)).toEqual(['appliances', 'Neighbours', 'Around the house'])
    expect(notes[0].title).toBe('Boiler')
  })

  it('keeps other properties as lines at the top and drops bookkeeping ones', () => {
    const [n] = parseOrgNotes('* Washing machine\n:PROPERTIES:\n:ID: abc-123\n:MODEL: Acme WM-1200\n:BOUGHT: 2022-03\n:END:\nFilter is behind the flap')
    expect(n.body).toBe('Model: Acme WM-1200\nBought: 2022-03\n\nFilter is behind the flap')
  })

  it('turns subheadings into lines ending in a colon, and keeps lists and blank lines', () => {
    const [n] = parseOrgNotes('* Neighbours\n** No. 12 :cats:\n- Sam and Alex\n- Cat called Biscuit\n\n** No. 16\nMrs Patel, spare key')
    expect(n.body).toBe('No. 12:\n- Sam and Alex\n- Cat called Biscuit\n\nNo. 16:\nMrs Patel, spare key')
  })

  it('keeps link addresses, so a manual can still be opened', () => {
    const [n] = parseOrgNotes('* Oven\n[[https://example.com/oven.pdf][Manual]], also [[https://example.com/faq]]\nSee [[file:~/manuals/oven.pdf][the PDF]]')
    expect(n.body).toBe('Manual (https://example.com/oven.pdf), also https://example.com/faq\nSee the PDF')
  })

  it('strips emphasis without eating slashes, and skips drawers, comments and planning lines', () => {
    const [n] = parseOrgNotes('* Gas meter\nSCHEDULED: <2026-11-10 Tue>\n:LOGBOOK:\n- Note taken\n:END:\n# a comment\nUnder the *stairs*, read 1/2 way /down/ and =code=')
    expect(n.body).toBe('Under the stairs, read 1/2 way down and code')
  })

  it('flattens tables to one line per row', () => {
    const [n] = parseOrgNotes('* Doctors\n| Name | Phone |\n|------+-------|\n| GP | 0118 000 |')
    expect(n.body).toBe('Name · Phone\nGP · 0118 000')
  })

  it('gives an empty body to a heading on its own, and finds nothing in an empty file', () => {
    expect(parseOrgNotes('* Spare key\n')).toEqual([{ title: 'Spare key', body: '' }])
    expect(parseOrgNotes('')).toEqual([])
  })
})
