import { ApiError, type ApiOverride } from '../api/client'
import type { ChoreSchedule, ExternalCalendar, ExternalEvents, Me, Note, Occurrence, Person, PlanEntry, Recipe, Settings, Shopping, Task, WallList, Weather } from '../api/types'
import { addDays, mondayOf, parseISODate, weekDays } from './dates'

/**
 * Made-up family data for the wall's demo mode, for photos of the frame. Every answer is invented and built
 * around today, so the wall looks lived-in whatever the date. Nothing real is read while the demo is on.
 */

const PEOPLE: Person[] = [
  { id: 'demo-alex', displayName: 'Alex', colour: '#2563eb', role: 'admin' },
  { id: 'demo-sam', displayName: 'Sam', colour: '#db2777', role: 'member' },
  { id: 'demo-maya', displayName: 'Maya', colour: '#16a34a', role: 'member' },
  { id: 'demo-leo', displayName: 'Leo', colour: '#f59e0b', role: 'member' },
]
const [ALEX, SAM, MAYA, LEO] = PEOPLE.map((p) => p.id)

const FAMILY: ExternalCalendar = { label: 'Family', colour: '#2563eb' }
const SCHOOL: ExternalCalendar = { label: 'School', colour: '#16a34a' }
const WORK: ExternalCalendar = { label: 'Work', colour: '#9333ea' }

type DemoEvent = { title: string; cal: ExternalCalendar; at?: string; until?: string; location?: string }

/** The same each week, by day (0 is Sunday). */
const WEEKLY: Record<number, DemoEvent[]> = {
  0: [{ title: "Lunch at Grandma's", cal: FAMILY, at: '12:30', until: '15:00' }],
  1: [{ title: 'Swimming lessons', cal: FAMILY, at: '17:30', until: '18:15', location: 'Leisure centre' }],
  2: [{ title: 'Recycling bins out', cal: FAMILY }],
  3: [{ title: 'Piano lesson', cal: SCHOOL, at: '16:00', until: '16:45' }],
  4: [{ title: 'Five-a-side football', cal: WORK, at: '19:30', until: '20:30', location: 'Sports centre' }],
  5: [{ title: 'Pizza and film night', cal: FAMILY, at: '18:00', until: '21:00' }],
  6: [{ title: 'Football training', cal: SCHOOL, at: '10:00', until: '11:30', location: 'Park pitches' }],
}

/** One-offs, by days from today. */
const ONE_OFF: Record<number, DemoEvent[]> = {
  [-8]: [{ title: 'Haircuts', cal: FAMILY, at: '16:00', until: '17:00' }],
  [-4]: [{ title: 'Boiler service', cal: FAMILY, at: '10:00', until: '11:00' }],
  [-2]: [{ title: 'Cinema', cal: FAMILY, at: '14:00', until: '16:30' }],
  0: [
    { title: 'Dentist: Maya', cal: FAMILY, at: '08:45', until: '09:15', location: 'High Street Dental' },
    { title: 'Team lunch', cal: WORK, at: '12:30', until: '13:30' },
    { title: 'Book club', cal: FAMILY, at: '20:00', until: '22:00', location: "Jo's house" },
  ],
  1: [{ title: 'Dog to the vet', cal: FAMILY, at: '09:30', until: '10:00' }],
  2: [{ title: "Parents' evening", cal: SCHOOL, at: '18:00', until: '19:00' }],
  3: [{ title: 'Sam away: Leeds', cal: WORK }],
  5: [{ title: "Leo's birthday party", cal: FAMILY, at: '14:00', until: '16:00', location: 'Jump Zone' }],
  9: [{ title: 'Teacher training day: no school', cal: SCHOOL }],
  12: [{ title: 'Car MOT', cal: FAMILY, at: '08:30', until: '09:30' }],
  16: [{ title: 'Dinner with the Parkers', cal: FAMILY, at: '19:30', until: '22:30' }],
  19: [{ title: 'School Christmas fair', cal: SCHOOL, at: '15:30', until: '17:30' }],
}

const daysBetween = (from: string, to: string) => Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000)
const instant = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString()

export function demoEvents(from: string, to: string, today: string): ExternalEvents {
  const events: Occurrence[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekly = WEEKLY[parseISODate(d).getDay()].map((e) => ({ e, recurring: true }))
    const once = (ONE_OFF[daysBetween(today, d)] ?? []).map((e) => ({ e, recurring: false }))
    for (const { e, recurring } of [...once, ...weekly]) {
      events.push({
        id: `demo-${e.title}-${recurring ? 'w' : d}`,
        title: e.title,
        allDay: !e.at,
        start: e.at ? instant(d, e.at) : d,
        // As the server sends them: an all-day event's end is its last day, not the day after.
        end: e.at ? instant(d, e.until ?? e.at) : d,
        location: e.location,
        occurrenceDate: d,
        recurring,
        external: e.cal,
      })
    }
  }
  events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
  return { calendars: [FAMILY, SCHOOL, WORK], events, unavailable: false }
}

function demoTasks(today: string): Task[] {
  const t = (id: string, title: string, due: number | null, assignee: string | null): Task => ({
    id: `demo-task-${id}`,
    title,
    dueDate: due === null ? null : addDays(today, due),
    assignee,
    done: false,
    createdBy: ALEX,
  })
  return [
    t('insurance', 'Renew the car insurance', -1, SAM),
    t('library', 'Return library books', 0, MAYA),
    t('trip', 'Sign the school trip form', 1, ALEX),
    t('cake', "Order Leo's birthday cake", 2, SAM),
    t('flights', 'Book summer holiday flights', 3, ALEX),
    t('windows', 'Pay the window cleaner', 5, null),
    t('gate', 'Fix the garden gate', null, SAM),
    t('tap', 'Call the plumber about the dripping tap', null, ALEX),
    t('loft', 'Sort out the loft', null, null),
    t('passports', 'Renew passports', 20, ALEX),
  ]
}

function demoLists(): WallList[] {
  const items = (key: string, rows: [string, string?][]) => rows.map(([name, note], n) => ({ id: `demo-${key}-${n}`, name, ...(note ? { note } : {}) }))
  return [
    {
      id: 'demo-groceries',
      name: 'Groceries',
      isDefault: true,
      items: items('g', [
        ['Milk', '2 pints'],
        ['Sourdough loaf'],
        ['Bananas'],
        ['Chicken thighs'],
        ['Peppers', 'red and yellow'],
        ['Tortilla wraps'],
        ['Cheddar'],
        ['Salmon fillets'],
        ['Cherry tomatoes'],
        ['Greek yoghurt'],
        ['Coffee beans'],
        ['Washing-up liquid'],
      ]),
    },
    { id: 'demo-party', name: "Leo's party", isDefault: false, items: items('p', [['Balloons'], ['Candles', 'number 8'], ['Party bags'], ['Juice cartons'], ['Paper plates']]) },
    { id: 'demo-diy', name: 'Hardware shop', isDefault: false, items: items('d', [['Picture hooks'], ['Light bulbs', 'E27 warm white'], ['Gate hinge'], ['Wood filler']]) },
  ]
}

const CHORES: ChoreSchedule = {
  chores: [
    { id: 'demo-c1', name: 'Empty the dishwasher' },
    { id: 'demo-c2', name: 'Bins out' },
    { id: 'demo-c3', name: 'Hoover downstairs' },
    { id: 'demo-c4', name: 'Feed the cat' },
    { id: 'demo-c5', name: 'Water the plants' },
    { id: 'demo-c6', name: 'Clean the bathroom' },
  ],
  assignments: [
    { choreId: 'demo-c1', memberId: LEO },
    { choreId: 'demo-c2', memberId: ALEX },
    { choreId: 'demo-c3', memberId: SAM },
    { choreId: 'demo-c4', memberId: MAYA },
    { choreId: 'demo-c5', memberId: MAYA },
    { choreId: 'demo-c6', memberId: ALEX },
  ],
}

/** Lunch and dinner by day of the week (0 is Sunday). */
const MEALS: [string, string][] = [
  ['Roast leftover wraps', 'Roast chicken'],
  ['Soup and sandwiches', 'Spaghetti bolognese'],
  ['Jacket potatoes', 'Chicken fajitas'],
  ['Pasta salad', 'Salmon traybake'],
  ['Leftovers', 'Vegetable curry'],
  ['Cheese toasties', 'Homemade pizza'],
  ['Pancakes', 'Fish and chips'],
]

function demoPlan(monday: string): PlanEntry[] {
  return weekDays(monday).flatMap((date) => {
    const [lunch, dinner] = MEALS[parseISODate(date).getDay()]
    return [
      { id: `demo-${date}-lunch`, date, slot: 'lunch' as const, text: lunch },
      { id: `demo-${date}-dinner`, date, slot: 'dinner' as const, text: dinner },
    ]
  })
}

const recipe = (id: string, title: string, tags: string[], serves: string, time: string, summary: string, ingredients: string[], method: string[], notes = ''): Recipe => ({
  id: `demo-recipe-${id}`,
  title,
  tags,
  serves,
  time,
  summary,
  ingredients: ingredients.join('\n'),
  method: method.join('\n'),
  notes,
})

const RECIPES: Recipe[] = [
  recipe('bolognese', 'Spaghetti bolognese', ['pasta', 'family favourite'], '4', '45 min', 'The weeknight classic. Makes enough to freeze a portion.',
    ['500g beef mince', '1 onion, chopped', '2 carrots, grated', '2 garlic cloves', '2 tins chopped tomatoes', '1 tbsp tomato purée', '1 tsp dried oregano', '400g spaghetti', 'Parmesan, to serve'],
    ['Soften the onion and carrot in a little oil for 8 minutes.', 'Add the garlic and mince and brown well.', 'Stir in the tomatoes, purée and oregano. Simmer for 30 minutes.', 'Cook the spaghetti, drain and toss with the sauce.', 'Serve with Parmesan.'],
    'Freezes well for up to three months.'),
  recipe('fajitas', 'Chicken fajitas', ['quick', 'mexican'], '4', '25 min', 'Everyone builds their own.',
    ['4 chicken thighs, sliced', '2 peppers, sliced', '1 red onion, sliced', '2 tsp fajita spice', '8 tortilla wraps', 'Soured cream, salsa and cheese'],
    ['Toss the chicken with the spice and a splash of oil.', 'Fry the chicken in a hot pan for 6 minutes.', 'Add the peppers and onion and cook until just soft.', 'Warm the wraps and serve everything at the table.']),
  recipe('salmon', 'Salmon traybake', ['quick', 'fish'], '4', '30 min', 'One tray, very little washing up.',
    ['4 salmon fillets', '500g new potatoes, halved', '200g green beans', '200g cherry tomatoes', '1 lemon', 'Olive oil'],
    ['Roast the potatoes at 200°C for 15 minutes.', 'Add the beans, tomatoes and salmon. Squeeze over the lemon.', 'Roast for another 12 to 15 minutes.']),
  recipe('curry', 'Vegetable curry', ['vegetarian', 'batch cook'], '6', '40 min', 'Mild enough for the children; add chilli at the table.',
    ['1 onion', '2 tbsp curry paste', '1 sweet potato, cubed', '1 tin chickpeas', '1 tin coconut milk', '200g spinach', 'Rice, to serve'],
    ['Fry the onion until soft, then stir in the curry paste.', 'Add the sweet potato, chickpeas and coconut milk.', 'Simmer for 20 minutes, then wilt in the spinach.', 'Serve with rice.']),
  recipe('pizza', 'Homemade pizza', ['friday', 'family favourite'], '4', '1 hr 30 min', 'Friday night. Everyone picks their toppings.',
    ['500g strong white flour', '7g dried yeast', '1 tsp salt', '325ml warm water', 'Passata', 'Mozzarella', 'Toppings of choice'],
    ['Mix the flour, yeast, salt and water and knead for 10 minutes.', 'Leave to rise for an hour.', 'Split into four, roll out and top.', 'Bake at 240°C for 10 to 12 minutes.']),
  recipe('roast', 'Roast chicken', ['sunday'], '4', '1 hr 45 min', 'Sunday lunch, with leftovers for Monday.',
    ['1 whole chicken, about 1.6kg', '1 lemon', 'Thyme', '1kg potatoes', 'Carrots and broccoli', 'Gravy'],
    ['Heat the oven to 200°C. Put the lemon and thyme inside the chicken.', 'Roast for 1 hour 20 minutes, until the juices run clear.', 'Par-boil the potatoes, then roast for 45 minutes.', 'Rest the chicken for 15 minutes while the vegetables cook.']),
  recipe('banana', 'Banana bread', ['baking'], '8', '1 hr 10 min', 'For the bananas nobody ate.',
    ['3 ripe bananas', '75g melted butter', '150g sugar', '1 egg', '1 tsp bicarbonate of soda', '190g plain flour'],
    ['Mash the bananas and mix in the butter, sugar and egg.', 'Fold in the bicarbonate and flour.', 'Bake in a lined loaf tin at 175°C for 1 hour.']),
  recipe('pancakes', 'Pancakes', ['breakfast', 'weekend'], '4', '20 min', 'Thick, American-style.',
    ['200g self-raising flour', '1 tbsp sugar', '2 eggs', '250ml milk', 'Butter for the pan'],
    ['Whisk everything into a thick batter.', 'Cook ladlefuls in a buttered pan until bubbles form, then flip.']),
]

const NOTES: Note[] = [
  { id: 'demo-note-wifi', title: 'Wi-Fi', category: 'Home', body: 'Network: Family-Home\nGuest network: Family-Guest\nThe passwords are on the card on the fridge.', updatedAt: '2026-01-01T09:00:00Z' },
  { id: 'demo-note-bins', title: 'Bin collection', category: 'Home', body: 'Tuesday mornings.\nRecycling (blue) one week, general waste (black) the next.\nGarden waste every other Friday, March to November.', updatedAt: '2026-01-01T09:00:00Z' },
  { id: 'demo-note-stopcock', title: 'Water stopcock', category: 'Home', body: 'Under the kitchen sink, behind the bin. Turn clockwise to close.', updatedAt: '2026-01-01T09:00:00Z' },
  { id: 'demo-note-next', title: 'Next door (No. 14)', category: 'Neighbours', body: 'Pat and Chris.\nThey keep our spare key.\nHappy to feed the cat when we are away.', updatedAt: '2026-01-01T09:00:00Z' },
  { id: 'demo-note-opposite', title: 'Across the road (No. 9)', category: 'Neighbours', body: 'Jo and family. Dog called Biscuit.\nJo runs the book club.', updatedAt: '2026-01-01T09:00:00Z' },
  { id: 'demo-note-boiler', title: 'Boiler', category: 'Appliances', body: 'Serviced every autumn.\nPressure should sit between 1 and 1.5 bar. Top up with the silver tap underneath.\nManual is in the kitchen drawer.', updatedAt: '2026-01-01T09:00:00Z' },
  { id: 'demo-note-washer', title: 'Washing machine', category: 'Appliances', body: 'Cottons 40°: everyday wash.\nQuick 30: lightly worn, 30 minutes.\nWool: hand-wash items.\nClean the filter (bottom left) once a month.', updatedAt: '2026-01-01T09:00:00Z' },
  { id: 'demo-note-clubs', title: 'Clubs and pick-ups', category: 'School', body: 'Monday: swimming, 17:30.\nWednesday: piano, 16:00.\nSaturday: football, 10:00. Bring water and shin pads.', updatedAt: '2026-01-01T09:00:00Z' },
]

/** Weather codes, highs and rain chances for the days from yesterday on. */
const FORECAST: [number, number, number][] = [
  [3, 12, 20],
  [1, 13, 10],
  [61, 11, 70],
  [3, 10, 30],
  [1, 12, 5],
  [80, 9, 60],
  [0, 11, 0],
  [2, 12, 15],
  [3, 10, 25],
]

function demoWeather(today: string, hour: number): Weather {
  return {
    place: 'Hometown',
    forecast: {
      current: { temperature: 11, code: 0, isDay: hour >= 7 && hour < 17 },
      days: FORECAST.map(([code, high, rainChance], i) => ({ date: addDays(today, i - 1), code, high, low: high - 6, rainChance })),
    },
  }
}

const SETTINGS: Settings = { breakfastEnabled: false }
const ME: Me = { ...PEOPLE[0], email: 'alex@example.com' }

/**
 * A fresh demo, answering the wall's API calls. Ticking a to-do or list item on the wall changes only the demo's
 * own copy, so the demo can be tapped about. Anything else is refused, so a missed route shows up rather than
 * quietly reaching the server.
 */
export function createDemoApi(today: () => string, hour: () => number = () => new Date().getHours()): ApiOverride {
  const tasks = demoTasks(today())
  const lists = demoLists()

  return async (fullPath, init) => {
    const [path, query = ''] = fullPath.split('?')
    const q = new URLSearchParams(query)
    const method = (init.method ?? 'GET').toUpperCase()
    const body = (init.json ?? {}) as { done?: boolean; checked?: boolean }
    const fresh = <T>(v: T): T => structuredClone(v)

    if (method === 'POST') {
      const done = path.match(/^\/tasks\/([^/]+)\/done$/)
      if (done) {
        const t = tasks.find((x) => x.id === done[1])
        if (t) t.done = !!body.done
        return fresh(t)
      }
      const checked = path.match(/^\/items\/([^/]+)\/checked$/)
      if (checked) {
        for (const l of lists) {
          const i = l.items.find((x) => x.id === checked[1]) as (WallList['items'][number] & { checked?: boolean }) | undefined
          if (i) i.checked = !!body.checked
        }
        return undefined
      }
    }
    if (method !== 'GET') throw new ApiError(403, 'DEMO', 'Not in the demo')

    const open = (l: WallList) => ({ ...l, items: l.items.filter((i) => !(i as { checked?: boolean }).checked) })
    switch (path) {
      case '/me':
        return fresh(ME)
      case '/people':
        return fresh(PEOPLE)
      case '/settings':
        return fresh(SETTINGS)
      case '/weather':
        return demoWeather(today(), hour())
      case '/tasks':
        return fresh(q.get('view') === 'done' ? tasks.filter((t) => t.done) : tasks.filter((t) => !t.done))
      case '/external-events':
        return demoEvents(q.get('from') ?? today(), q.get('to') ?? today(), today())
      case '/plan':
        return demoPlan(mondayOf(q.get('week') ?? today()))
      case '/chores':
        return fresh(CHORES)
      case '/recipes':
        return fresh(RECIPES)
      case '/notes':
        // By category then title, as the server sends them.
        return fresh(NOTES).sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.title.localeCompare(b.title))
      case '/shopping': {
        const { id, name, items } = open(lists[0])
        return fresh<Shopping>({ id, name, items })
      }
      case '/shopping/lists':
        return fresh(lists.map(open))
    }
    throw new ApiError(404, 'DEMO', 'Not in the demo')
  }
}
