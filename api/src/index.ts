import { route } from './lib/http'
import * as admin from './handlers/admin'
import * as chores from './handlers/chores'
import * as events from './handlers/events'
import * as lists from './handlers/lists'
import * as me from './handlers/me'
import * as plan from './handlers/plan'
import * as recipes from './handlers/recipes'
import * as tasks from './handlers/tasks'
import * as weather from './handlers/weather'

const ADMIN = { roles: ['admin' as const] }
const ANY = {}

route('me-get', 'GET', 'me', ANY, me.getMe)
route('me-patch', 'PATCH', 'me', ANY, me.patchMe)
route('people-get', 'GET', 'people', ANY, me.getPeople)

route('external-events-list', 'GET', 'external-events', ANY, events.listExternalEvents)

route('lists-get', 'GET', 'lists', ANY, lists.getLists)
route('lists-create', 'POST', 'lists', ADMIN, lists.createList)
route('lists-delete', 'DELETE', 'lists/{id}', ADMIN, lists.deleteList)
route('items-get', 'GET', 'lists/{id}/items', ANY, lists.getItems)
route('items-add', 'POST', 'lists/{id}/items', ANY, lists.addItem)
route('items-clear', 'DELETE', 'lists/{id}/items', ANY, lists.clearChecked)
route('items-patch', 'PATCH', 'items/{id}', ANY, lists.patchItem)
route('items-delete', 'DELETE', 'items/{id}', ANY, lists.deleteItem)

route('tasks-get', 'GET', 'tasks', ANY, tasks.getTasks)
route('tasks-create', 'POST', 'tasks', ANY, tasks.createTask)
route('tasks-patch', 'PATCH', 'tasks/{id}', ANY, tasks.patchTask)
route('tasks-delete', 'DELETE', 'tasks/{id}', ANY, tasks.deleteTask)

route('plan-get', 'GET', 'plan', ANY, plan.getPlan)
route('plan-copy', 'POST', 'plan/copy-week', ANY, plan.copyWeek)
route('plan-set', 'PUT', 'plan/{date}/{slot}', ANY, plan.setPlanCell)
route('plan-clear', 'DELETE', 'plan/{date}/{slot}', ANY, plan.clearPlanCell)

route('recipes-get', 'GET', 'recipes', ANY, recipes.getRecipes)
route('recipes-create', 'POST', 'recipes', ANY, recipes.createRecipe)
route('recipes-patch', 'PATCH', 'recipes/{id}', ANY, recipes.patchRecipe)
route('recipes-delete', 'DELETE', 'recipes/{id}', ANY, recipes.deleteRecipe)

route('integration-recipes', 'POST', 'integration/recipes', { integration: true }, recipes.intakeRecipes)

route('chores-get', 'GET', 'chores', ANY, chores.getChores)
route('chores-create', 'POST', 'chores', ANY, chores.createChore)
route('chores-copy', 'POST', 'chores/copy-week', ANY, chores.copyChoreWeek)
route('chores-patch', 'PATCH', 'chores/{id}', ANY, chores.patchChore)
route('chores-delete', 'DELETE', 'chores/{id}', ANY, chores.deleteChore)
route('chores-assign', 'PUT', 'chores/{id}/weeks/{week}', ANY, chores.assignChore)
route('chores-unassign', 'DELETE', 'chores/{id}/weeks/{week}', ANY, chores.unassignChore)

route('weather-get', 'GET', 'weather', ANY, weather.getWeather)

route('settings-get', 'GET', 'settings', ANY, admin.getSettings)
route('settings-patch', 'PATCH', 'settings', ADMIN, admin.patchSettings)

route('members-get', 'GET', 'members', ADMIN, admin.getMembers)
route('members-invite', 'POST', 'members/invite', ADMIN, admin.invite)
route('members-remove', 'DELETE', 'members/{id}', ADMIN, admin.removeMember)

route('export-get', 'GET', 'export', ADMIN, admin.exportAll)
route('admin-erase', 'POST', 'admin/erase', ADMIN, admin.erase)
