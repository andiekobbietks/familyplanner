const PATHS = {
  home: 'M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 3v4M16 3v4M3 10.5h18',
  basket: 'M3 9.5h18l-2 10a1.5 1.5 0 0 1-1.5 1.2h-11A1.5 1.5 0 0 1 5 19.5zM7.5 9.5 11 3.5M16.5 9.5 13 3.5M9.5 13.5v3.5M14.5 13.5v3.5',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16 9.6',
  meals: 'M6 3v6.5a2.5 2.5 0 0 0 5 0V3M8.5 3v18M17.5 21v-7M17.5 14c-2 0-3.2-1.8-3.2-5.2S16 3 17.5 3z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M5 9l7 7 7-7',
  move: 'M8 20V4M8 4 4.5 7.5M8 4l3.5 3.5M16 4v16M16 20l-3.5-3.5M16 20l3.5-3.5',
  sun: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  cloud: 'M7 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1 4.5 4.5 0 0 1 .5 9z',
  partly: 'M9.5 3.5V5M3.5 9.5H5M5.3 5.3l1 1M13.7 5.3l-1 1M6.2 12a3.8 3.8 0 0 1 6.9-3M8 20a3.2 3.2 0 0 1-.4-6.4 4.4 4.4 0 0 1 8.5-.8 3.7 3.7 0 0 1 .4 7.2z',
  rain: 'M7 14.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1 4.5 4.5 0 0 1 .5 9zM8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3',
  snow: 'M7 14.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1 4.5 4.5 0 0 1 .5 9zM8 18v.01M12 18v.01M16 18v.01M10 21v.01M14 21v.01',
  storm: 'M7 14.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1 4.5 4.5 0 0 1 .5 9zM13 13l-2.5 4h3L11 21.5',
  fog: 'M7 13.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1 4.5 4.5 0 0 1 .5 9zM5 17h14M7 20.5h10',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 21H20v-3',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l3 3',
  note: 'M5 3.5h14A1.5 1.5 0 0 1 20.5 5v9.5l-6 6H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM20.5 14.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5M7.5 8.5h9M7.5 12.5h6',
  chat: 'M5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 15.5v-10A1.5 1.5 0 0 1 5.5 4z',
} as const

export type IconName = keyof typeof PATHS

/** Line icons drawn in-house so that every platform shows the same set, which emoji do not. */
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}
