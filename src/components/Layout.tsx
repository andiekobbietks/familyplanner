import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useMe } from '../api/hooks'
import { Avatar } from './People'

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/calendar', label: 'Calendar', icon: '▦' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/todos', label: 'To-dos', icon: '✓' },
  { to: '/meals', label: 'Meals', icon: '🍽' },
]

export function Layout() {
  const { data: me } = useMe()
  const [menu, setMenu] = useState(false)

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          FamilyPlanner
        </NavLink>
        <nav className="topnav" aria-label="Sections">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="menu-wrap">
          <button type="button" className="menu-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Avatar person={me} size={28} />
            <span className="menu-name">{me?.displayName ?? '…'}</span>
          </button>
          {menu && (
            <div className="menu" role="menu" onClick={() => setMenu(false)}>
              <NavLink to="/profile" role="menuitem">
                My profile
              </NavLink>
              {me?.role === 'admin' && (
                <>
                  <NavLink to="/members" role="menuitem">
                    Members
                  </NavLink>
                  <NavLink to="/settings" role="menuitem">
                    Settings
                  </NavLink>
                </>
              )}
              <a href="/.auth/logout" role="menuitem">
                Log out
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Sections">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <span className="tab-icon" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
