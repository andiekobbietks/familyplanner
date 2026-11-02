import { NavLink } from 'react-router-dom'

/** Sections of one page that have their own address, so the bottom bar stays at five items. */
export function PageTabs({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="tabs" aria-label="Section">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
