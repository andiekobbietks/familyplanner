import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useMe } from '../api/hooks'
import { Icon, type IconName } from './Icons'
import { Avatar } from './People'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/meals', label: 'Meals', icon: 'meals' },
  { to: '/shopping', label: 'Shopping', icon: 'basket' },
  { to: '/todos', label: 'To-dos', icon: 'check' },
]

export function Layout() {
  const { data: me } = useMe()
  const [menu, setMenu] = useState(false)

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icons/icon.svg" alt="" width={26} height={26} />
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
          <button type="button" className="menu-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu((m) => !m)}>
            <Avatar person={me} size={32} />
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
              <a href="/.auth/logout?post_logout_redirect_uri=/login" role="menuitem">
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
            <span className="tab-icon">
              <Icon name={n.icon} />
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
