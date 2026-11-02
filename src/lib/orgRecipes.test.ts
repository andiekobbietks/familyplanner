import { describe, expect, it } from 'vitest'
import { parseOrgRecipes } from './orgRecipes'

const list = `#+title: Recipes

* Easy Kebabs (Chapli-Style)             :kebab:lamb:middle-eastern:
:PROPERTIES:
:SERVINGS: 4 (8 kebabs)
:PREP:     15 min (+ 15 min fridge rest)
:COOK:     9 min
:SOURCE:   homemade
:ADDED:    [2026-09-29]
:END:

Spiced patties, no skewers needed.

** Ingredients
- 500 g ground lamb
- 1/2 tsp chilli flakes (adjust to taste)

** Method
1. Mix well with your hands.
2. Heat to 71°C / 160°F, then rest. ⏱ 15m

** Notes
- Freezes well raw.
`

const table = `* Classic Vanilla Bundt Cake                         :baking:cake:
:PROPERTIES:
:SERVES:   12
:BAKE:     50-55 min
:TEMP:     175°C (160°C fan)
:RATING:   ★★★★★
:ADDED:    [2026-06-10]
:END:

A moist, tender vanilla bundt cake made with vegetable oil for a
reliably soft crumb.

** Ingredients
*** Cake
| Amount | Ingredient      |
|--------+-----------------|
| 300 g  | Plain flour     |
| 4     | Medium eggs     |

*** Vanilla Glaze
| Amount | Ingredient      |
|--------+-----------------|
| 150 g  | Icing sugar     |

** Notes
- *Tin prep* is the #1 failure point
- *Eggs:* 3 medium eggs work

** Variations
- Add zest of 1 lemon
`

const subRecipe = `* One Pot Rigatoni                     :pasta:
:PROPERTIES:
:SERVINGS: 6-8
:END:

** Sausage (make first)
Brian's hot Italian sausage mix. Sized for the
680g the rigatoni needs.

| Amount      | Ingredient                     |
|-------------+--------------------------------|
| 680 g       | 80/20 ground pork              |
| 10 g (2 tsp) | Salt                          |

1. Toast fennel seed in a dry pan.
2. Combine all ingredients.

** Ingredients
| Amount      | Ingredient                              |
|-------------+-----------------------------------------|
| 450 g       | Rigatoni, dry                           |

** Method
1. Preheat oven to 200°C / 400°F.
`

const wrapped = `* Oven-Baked Hake                 :fish:
:PROPERTIES:
:SERVINGS: 1
:TIME:     20 min
:KCAL:     278 (20.9g protein)
:END:

** Ingredients
- Salt — pinch

** Method
1. *Season the hake*
   Drizzle a roasting tin with 1 tbsp olive oil and add the salt and black
   pepper.

2. *Mix the spiced breadcrumbs*
   In a bowl, combine breadcrumbs.
   /Note: this coating is quite spicy — halve the cayenne and chilli flakes
   for a milder version./

3. *Coat and bake* (timer: 15 min)
   Smear the mixture over the top.
`

const stub = `* Beef and Broccoli Stir Fry                        :stirfry:beef:
:PROPERTIES:
:SOURCE:   https://damndelicious.net/2014/08/13/easy-beef-broccoli/
:END:

* Menemen                                            :eggs:
:PROPERTIES:
:SERVINGS:
:SOURCE:   https://www.seriouseats.com/menemen
:END:

Turkish eggs — super nice. Goes with the [[*One Pot Rigatoni][rigatoni]] above.

** Ingredients
- 3 eggs
`

describe('parseOrgRecipes', () => {
  it('reads a list recipe', () => {
    expect(parseOrgRecipes(list)).toEqual([
      {
        title: 'Easy Kebabs (Chapli-Style)',
        summary: 'Spiced patties, no skewers needed.',
        serves: '4 (8 kebabs)',
        time: 'Prep 15 min (+ 15 min fridge rest), Cook 9 min',
        source: 'homemade',
        tags: ['kebab', 'lamb', 'middle-eastern'],
        ingredients: '500 g ground lamb\n1/2 tsp chilli flakes (adjust to taste)',
        method: 'Mix well with your hands.\nHeat to 71°C / 160°F, then rest. ⏱ 15m',
        notes: 'Freezes well raw.',
      },
    ])
  })

  it('reads tables and subsections, and keeps properties that have no field as notes', () => {
    const [r] = parseOrgRecipes(table)
    expect(r.serves).toBe('12')
    expect(r.time).toBe('Bake 50-55 min')
    expect(r.summary).toBe('A moist, tender vanilla bundt cake made with vegetable oil for a reliably soft crumb.')
    expect(r.ingredients).toBe('Cake:\n300 g Plain flour\n4 Medium eggs\nVanilla Glaze:\n150 g Icing sugar')
    expect(r.notes).toBe('Temp: 175°C (160°C fan)\nRating: ★★★★★\nTin prep is the #1 failure point\nEggs: 3 medium eggs work\nVariations:\nAdd zest of 1 lemon')
  })

  it('keeps a sub-recipe apart from the main recipe', () => {
    const [r] = parseOrgRecipes(subRecipe)
    expect(r.ingredients).toBe('Sausage (make first):\n680 g 80/20 ground pork\n10 g (2 tsp) Salt\nMain recipe:\n450 g Rigatoni, dry')
    expect(r.method).toBe('Sausage (make first):\nToast fennel seed in a dry pan.\nCombine all ingredients.\nMain recipe:\nPreheat oven to 200°C / 400°F.')
    expect(r.notes).toBe("Brian's hot Italian sausage mix. Sized for the 680g the rigatoni needs.")
  })

  it('joins wrapped steps and strips emphasis that runs across lines', () => {
    const [r] = parseOrgRecipes(wrapped)
    expect(r.time).toBe('20 min')
    expect(r.method.split('\n')).toEqual([
      'Season the hake. Drizzle a roasting tin with 1 tbsp olive oil and add the salt and black pepper.',
      'Mix the spiced breadcrumbs. In a bowl, combine breadcrumbs. Note: this coating is quite spicy — halve the cayenne and chilli flakes for a milder version.',
      'Coat and bake (timer: 15 min). Smear the mixture over the top.',
    ])
    expect(r.notes).toBe('Kcal: 278 (20.9g protein)')
  })

  it('accepts a recipe that is only a link, ignores empty properties and flattens org links', () => {
    const [beef, menemen] = parseOrgRecipes(stub)
    expect(beef).toEqual({ title: 'Beef and Broccoli Stir Fry', source: 'https://damndelicious.net/2014/08/13/easy-beef-broccoli/', tags: ['stirfry', 'beef'], ingredients: '', method: '', notes: '' })
    expect(menemen.serves).toBeUndefined()
    expect(menemen.summary).toBe('Turkish eggs — super nice. Goes with the rigatoni above.')
  })

  it('finds nothing in a file with no headings', () => {
    expect(parseOrgRecipes('just some text\n')).toEqual([])
  })
})
