import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRecipes } from '../api/hooks'
import { Icon } from '../components/Icons'
import { PageTabs } from '../components/PageTabs'
import { RecipeEditor } from '../components/RecipeEditor'
import { matchesSearch } from '../lib/recipes'
import { MEAL_TABS } from './MealPlan'

export function Recipes() {
  const { data: recipes = [], isLoading } = useRecipes()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Most used first, so the useful tags are the ones on screen without scrolling.
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [recipes])

  const shown = recipes.filter((r) => matchesSearch(r, search) && (!tag || r.tags.includes(tag)))

  return (
    <>
      <PageTabs tabs={MEAL_TABS} />
      <div className="page-head">
        <h1 className="grow">Recipes</h1>
        <button className="btn sm primary" type="button" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />
          New
        </button>
      </div>

      <input className="recipe-search" type="search" aria-label="Search recipes" placeholder="Search by name or ingredient…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {tags.length > 0 && (
        <div className="filter-row">
          <div className="chips" role="group" aria-label="Filter by tag">
            {tags.map((t) => (
              <button key={t} type="button" className={`chip ${tag === t ? 'on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        {isLoading && <p className="loading">Loading…</p>}
        {!isLoading && recipes.length === 0 && <p className="empty">No recipes yet. An admin can import an org file from Settings.</p>}
        {!isLoading && recipes.length > 0 && shown.length === 0 && <p className="empty">Nothing matches.</p>}
        <ul className="list">
          {shown.map((r) => (
            <li key={r.id}>
              <Link className="title recipe-row" to={`/meals/recipes/${r.id}`}>
                {r.title}
                {(r.time || r.serves) && <span className="sub">{[r.time, r.serves && `Serves ${r.serves}`].filter(Boolean).join(' · ')}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {adding && <RecipeEditor onClose={() => setAdding(false)} onSaved={(r) => navigate(`/meals/recipes/${r.id}`)} />}
    </>
  )
}
