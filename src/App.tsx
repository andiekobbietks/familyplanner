import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireMember } from './auth'
import { Layout } from './components/Layout'
import { Calendar } from './pages/Calendar'
import { Chat } from './pages/Chat'
import { Display } from './pages/Display'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { MealPlan } from './pages/MealPlan'
import { Members } from './pages/Members'
import { NotAMember } from './pages/NotAMember'
import { Profile } from './pages/Profile'
import { RecipeDetail } from './pages/RecipeDetail'
import { Recipes } from './pages/Recipes'
import { Settings } from './pages/Settings'
import { Shopping } from './pages/Shopping'
import { Todos } from './pages/Todos'
import { useMe } from './api/hooks'

function AdminOnly({ children }: { children: JSX.Element }) {
  const { data: me } = useMe()
  if (!me) return null
  return me.role === 'admin' ? children : <Navigate to="/" replace />
}

/** The display account only ever sees the wall page, whatever address it opens. */
function NotDisplay({ children }: { children: JSX.Element }) {
  const { data: me, isLoading } = useMe()
  if (isLoading) return <div className="loading">Loading…</div>
  return me?.role === 'display' ? <Navigate to="/display" replace /> : children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/not-a-member" element={<NotAMember />} />
      <Route
        path="/display"
        element={
          <RequireMember>
            <Display />
          </RequireMember>
        }
      />
      <Route
        element={
          <RequireMember>
            <NotDisplay>
              <Layout />
            </NotDisplay>
          </RequireMember>
        }
      >
        <Route index element={<Home />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/todos" element={<Todos />} />
        <Route path="/meals" element={<MealPlan />} />
        <Route path="/meals/recipes" element={<Recipes />} />
        <Route path="/meals/recipes/:id" element={<RecipeDetail />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="/members"
          element={
            <AdminOnly>
              <Members />
            </AdminOnly>
          }
        />
        <Route
          path="/settings"
          element={
            <AdminOnly>
              <Settings />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
