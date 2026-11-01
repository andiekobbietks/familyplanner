import { route } from './lib/http'
import * as admin from './handlers/admin'
import * as events from './handlers/events'
import * as lists from './handlers/lists'
import * as meals from './handlers/meals'
import * as me from './handlers/me'
import * as tasks from './handlers/tasks'

const ADMIN = { roles: ['admin' as const] }
const ANY = {}

route('me-get', 'GET', 'me', ANY, me.getMe)
route('me-patch', 'PATCH', 'me', ANY, me.patchMe)
route('people-get', 'GET', 'people', ANY, me.getPeople)

route('events-list', 'GET', 'events', ANY, events.listEvents)
route('events-create', 'POST', 'events', ANY, events.createEvent)
route('events-update', 'PUT', 'events/{id}', ANY, events.updateEvent)
route('events-delete', 'DELETE', 'events/{id}', ANY, events.deleteEvent)

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

route('meals-get', 'GET', 'meals', ANY, meals.getMeals)
route('meals-create', 'POST', 'meals', ANY, meals.createMeal)
route('meals-patch', 'PATCH', 'meals/{id}', ANY, meals.patchMeal)
route('meals-archive', 'DELETE', 'meals/{id}', ADMIN, meals.archiveMeal)

route('plan-get', 'GET', 'plan', ANY, meals.getPlan)
route('plan-copy', 'POST', 'plan/copy-week', ANY, meals.copyWeek)
route('plan-shop', 'POST', 'plan/shop', ANY, meals.shop)
route('plan-set', 'PUT', 'plan/{date}/{slot}', ANY, meals.setPlanCell)
route('plan-clear', 'DELETE', 'plan/{date}/{slot}', ANY, meals.clearPlanCell)

route('settings-get', 'GET', 'settings', ANY, admin.getSettings)
route('settings-patch', 'PATCH', 'settings', ADMIN, admin.patchSettings)

route('members-get', 'GET', 'members', ADMIN, admin.getMembers)
route('members-invite', 'POST', 'members/invite', ADMIN, admin.invite)
route('members-remove', 'DELETE', 'members/{id}', ADMIN, admin.removeMember)

route('export-get', 'GET', 'export', ADMIN, admin.exportAll)
route('admin-erase', 'POST', 'admin/erase', ADMIN, admin.erase)
