import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
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

const isChores = (path: string, search: string) => path === '/todos' && new URLSearchParams(search).get('view') === 'chores'
const isRecipes = (path: string) => path.startsWith('/meals/recipes')

/** There is room for Recipes and Chores at the top. On a phone they stay as tabs inside Meals and To-dos. */
const TOP: { to: string; label: string; current: (path: string, search: string) => boolean }[] = [
  { to: '/', label: 'Home', current: (p) => p === '/' },
  { to: '/calendar', label: 'Calendar', current: (p) => p === '/calendar' },
  { to: '/meals', label: 'Meals', current: (p) => p === '/meals' },
  { to: '/meals/recipes', label: 'Recipes', current: isRecipes },
  { to: '/shopping', label: 'Shopping', current: (p) => p === '/shopping' },
  { to: '/todos', label: 'To-dos', current: (p, q) => p === '/todos' && !isChores(p, q) },
  { to: '/todos?view=chores', label: 'Chores', current: isChores },
  { to: '/chat', label: 'Chat', current: (p) => p === '/chat' },
]

export function Layout() {
  const { data: me } = useMe()
  const { pathname, search } = useLocation()
  const [menu, setMenu] = useState(false)

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icons/icon.svg" alt="" width={26} height={26} />
          FamilyPlanner
        </NavLink>
        <nav className="topnav" aria-label="Sections">
          {TOP.map((n) => {
            const current = n.current(pathname, search)
            return (
              <Link key={n.to} to={n.to} className={current ? 'active' : undefined} aria-current={current ? 'page' : undefined}>
                {n.label}
              </Link>
            )
          })}
        </nav>
        <div className="menu-wrap">
          <button type="button" className="menu-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu((m) => !m)}>
            <Avatar person={me} size={32} />
            <span className="menu-name">{me?.displayName ?? '…'}</span>
          </button>
          {menu && (
            <div className="menu" role="menu" onClick={() => setMenu(false)}>
              <NavLink to="/chat" role="menuitem">
                Chat
              </NavLink>
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
