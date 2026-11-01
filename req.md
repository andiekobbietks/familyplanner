# FamilyPlanner — Requirements Document
**Version:** 0.5 (v1 scope)
**Status:** Draft
**Last updated:** 1 November 2026

---

## 1. Overview

FamilyPlanner is a small private website for one household. It gives every family member a shared calendar, shopping lists, to-do lists and a weekly meal plan that stay in sync across phones and laptops. It is hosted on Azure Static Web Apps, costs close to nothing to run, and is reachable only by invited family members after a simple login.

The product is deliberately small. It is not a general-purpose SaaS product. There is one family, a handful of users, and a strong preference for "boring", well-supported building blocks over clever ones. Security is a first-class requirement because the data describes where the family will be and when.

---

## 2. Goals

- A family member can open the site on a phone and see today's events, tonight's dinner, open shopping items and their own to-dos within two seconds of login.
- Adding an event, shopping item or task takes fewer than three taps.
- Only invited family members can see or change anything. Nothing is readable anonymously, including the API.
- Runs on the free tiers of Azure Static Web Apps and Azure Cosmos DB, with a target of under £5 per month all-in.
- No passwords are stored or handled by the application itself. Authentication is delegated to a provider.
- The whole codebase is small enough that one person can understand it in an afternoon.

---

## 3. Non-goals (v1)

Explicitly out of scope for the first release:

- Multi-family or multi-tenant support. Data model should allow it later (a `familyId` on every record), but no UI or logic for it.
- Native mobile apps. A responsive, installable web app (PWA) is sufficient.
- Push notifications or reminders. Deferred to v2.
- Real-time collaboration (WebSockets or SignalR). Polling on focus is sufficient for v1.
- Two-way sync with Google Calendar, Outlook or Apple Calendar. Displaying Google calendars read-only is in scope (Section 5.3.1); writing to them is not. A read-only ICS export feed from the planner is a v2 candidate.
- Budgeting, chores with rewards, photo sharing. All possible later, none in v1.
- Recipe import from websites, nutrition information, portion scaling. The meal planner in v1 is a plan plus a simple meal library, not a recipe manager.
- Offline editing. The app should load its shell offline but does not need to queue writes.
- Any AI features.
- Integration with a home server (document storage, smart home). Planned for v2; Section 15 records what v1 does now to keep that door open.

---

## 4. Users and roles

**Household size:** two adults and up to four children. Assume a maximum of ten accounts.

| Role | Who | Can do |
|---|---|---|
| `admin` | Parents | Everything a member can do, plus invite and remove members, delete lists, export all data. |
| `member` | Other family members | Create, edit and complete events, list items and tasks. See everything. |

Notes:

- Every user is assigned to exactly one of the two roles at invitation time.
- There is no anonymous role. An unauthenticated visitor sees only a login page.
- A "child" role with reduced capabilities (for example, complete tasks but not delete events) is a v2 candidate. Design the authorisation check as a single function so adding a role is a one-place change.

---

## 5. Feature specifications

### 5.1 Authentication and access

- Login uses the built-in authentication of Azure Static Web Apps. The app never sees or stores a password.
- Exactly one identity provider is enabled for v1. The default recommendation is Microsoft accounts (Entra ID, personal and work accounts). See Open Decision D1 for the alternative.
- Access is invitation-only. An admin generates an invitation link from the Azure portal (or a small admin page that calls the SWA management API) for a specific email address and role. Invitations expire within 24 hours.
- A user who logs in with a valid provider account but has not been invited is shown a "not a member of this family" page and has no access to any data or API route.
- All routes except `/login`, `/.auth/*` and static assets require the `member` or `admin` role. This is enforced in `staticwebapp.config.json`, not only in client-side code.
- Every API route also requires `member` or `admin`, enforced in the same config file and re-checked inside each function handler.
- Logout is a visible button that calls `/.auth/logout` and returns the user to the login page.
- Session lifetime follows the SWA default. The app must handle a 401 from any API call by redirecting to login rather than showing a broken screen.

### 5.2 Home (dashboard)

The landing page after login. Read-only summary, with links into each section.

- Today's date and the next seven days of events, grouped by day, including events from any connected Google calendars (Section 5.3.1).
- Count of unchecked shopping items per list, with a link to each list.
- The current user's open tasks due today or overdue.
- Today's lunch and dinner (and breakfast if enabled), with a link to the week's plan. An empty slot shows a "Plan lunch" or "Plan dinner" link. After 15:00 the dashboard also shows tomorrow's lunch, since packed lunches are prepared the evening before.
- A quick-add bar at the top: type text, choose event / shopping / task, submit. Defaults to the most recently used type.

### 5.3 Calendar

- Views: month, week and agenda (a scrolling list of upcoming events). Agenda is the default on phones, month on larger screens.
- An event has: title (required), start date and time, end date and time, all-day flag, one or more assigned members, optional location, optional notes, colour derived from the first assigned member.
- All-day events store a date only, not a time, so they never shift with timezone changes.
- Timed events store an ISO 8601 UTC instant plus the IANA timezone the event was created in (`Europe/London`). Display always uses the browser's local timezone.
- Recurrence in v1 is limited to: none, daily, weekly, every N weeks, monthly on the same date. Recurring events store the rule, not expanded copies. Editing offers "this occurrence" or "all future occurrences". Deleting a single occurrence adds an exception date to the rule.
- Filter by member. "Everyone" is the default.
- Any member can create, edit or delete any event. Every change records who made it and when.

#### 5.3.1 Google calendars (read-only display)

At minimum, the planner displays one or more existing Google calendars alongside its own events. It does not write to them.

- Each connected calendar is read from its Google "Secret address in iCal format", which works for a private calendar without any Google login inside the planner.
- The API fetches and parses the feed on the server. The browser never contacts Google and never receives the feed address, so the CSP is unchanged (S10) and nothing is embedded (S11).
- Google events appear in the month, week and agenda views and on the dashboard. They show title, time, all-day flag and location, are visibly marked with the calendar's label and colour (never colour alone), and have no edit or delete controls.
- Recurring events, exceptions and all-day events in the feed display on the correct dates, including across the clock changes (Section 8).
- Filter by calendar. "Everyone" includes connected calendars.
- Connected calendars are configured by application setting as a list of label and feed address (S19), not through the UI. Every member sees every connected calendar.
- Feed contents are cached in memory for up to 15 minutes and are not written to the database, so a Google event's changes appear within 15 minutes and the export (A10) is unaffected.
- If a feed cannot be fetched or parsed, the planner's own events still display, and the calendar shows "Google calendar unavailable" rather than an error. The last good cached copy may be shown instead.

### 5.4 Shopping lists

- Multiple named lists (for example Groceries, Hardware, Christmas). An admin can create and delete lists; members can add and complete items on any list.
- An item has: name (required), optional quantity or note (free text, for example "2 kg"), optional category (Produce, Dairy, Bakery, Household, Other), checked flag, who added it.
- Adding an item is a single text box with autocomplete from previously used item names on that list. Enter adds the item and keeps focus in the box.
- Checked items move to a collapsed "Done" section at the bottom. A "Clear done" action deletes them after a confirmation.
- Items are grouped by category when a category is set, with uncategorised items at the top.
- The list refreshes when the tab regains focus and every 30 seconds while visible, so two people shopping together see each other's changes without a manual reload.
- **Copy to clipboard.** A single button on every list copies the unchecked items as plain text, one item per line, with the quantity or note appended (`Milk 2 pints`). Items are grouped under their category heading when categories are in use. A toast confirms "Copied 12 items". The button uses the async Clipboard API, which works on HTTPS in all supported browsers; if the call fails, the same text is shown in a selectable text box as a fallback. The intended use is pasting the list into a message or a supermarket app.

### 5.5 To-dos

- A task has: title (required), optional due date, optional assigned member, optional notes, done flag, created by, completed by and completed at.
- Views: "Mine", "Everyone", and "Done" (last 30 days). "Mine" is the default.
- Sorting: overdue first, then by due date, then undated. Done tasks sort by completion date descending.
- Completing a task is a single tap on a checkbox. Undo is available for five seconds via a toast.
- Simple recurring chores (repeat daily, weekly, every N weeks) are a v2 candidate. Do not build in v1, but do not store tasks in a way that makes it hard to add.

### 5.6 Meal planning

A week-at-a-glance plan of what the family is eating, backed by a small library of meals the family actually cooks, with a one-tap way to get the ingredients onto the shopping list.

**Plan**

- The plan is a grid of days by slots. Lunch and Dinner are enabled by default. An admin can enable Breakfast in settings. Slots always display in the order Breakfast, Lunch, Dinner.
- Views: the current week (Monday to Sunday) with previous and next week navigation. On a phone, a vertical list of days, each showing its Lunch and Dinner rows; on a larger screen, a seven-column grid with one row per slot.
- Lunches are often simpler and repeated, so the meal picker for a Lunch cell shows meals tagged Lunch first and offers "Same as yesterday" as a one-tap option. A meal can carry both Lunch and Dinner tags.
- Each cell holds zero or one entry. An entry is either a meal from the library or free text ("Leftovers", "Eating at Grandma's"). Free text is for one-offs and does not create a library meal.
- Optionally, an entry has a cook (a member) and a note ("start the slow cooker at 2pm").
- Drag and drop between cells on desktop. On a phone, tap a cell to pick a meal or type free text; a "move" action in the cell menu picks a target day.
- "Copy last week" fills the current week from the previous one, skipping cells already filled.

**Meal library**

- A meal has: name (required), optional ingredients (a list of free-text lines such as "500 g mince"), optional link (URL to the recipe online), optional notes, optional tags (Lunch, Dinner, Quick, Veggie, Freezer, Kids' favourite, Packed lunch), and a computed "last planned" date.
- Ingredient lines can be given a shopping category so they land in the right section of the list.
- Picking a meal for a cell searches the library by name and tag, showing most-recently-planned first. Typing a name that does not exist offers "Create meal" inline.
- Links open in a new tab with `rel="noopener noreferrer"`. Only `http` and `https` URLs are accepted (S13 applies).

**Shopping integration**

- On any planned meal, "Add ingredients to list" adds each ingredient line to a chosen shopping list (default: Groceries) as unchecked items. Lines that already exist unchecked on that list, matched case-insensitively by name, are skipped and reported in the toast ("Added 6, skipped 2 already on the list").
- On the week view, "Shop this week" does the same for every planned meal in every slot for the week in one action, with a confirmation showing the item count first.
- Items added this way record the meal name in the item note so it is clear why they are on the list.

**Permissions**

- Any member can plan, create meals and add ingredients. Deleting a meal from the library is admin-only; it does not remove past plan entries, which keep the meal name as free text.

### 5.7 Members and settings (admin only)

- List of members with name, email, role, last login.
- Invite a new member: email and role, generates a link the admin shares by hand.
- Remove a member. Their historical actions remain attributed by display name.
- Each member can set their own display name and colour.
- Meal plan settings: whether Breakfast is enabled (Lunch and Dinner are always on) and the default shopping list for ingredients.
- "Export all data" downloads a single JSON file containing every record. This doubles as the manual backup mechanism.

---

## 6. Architecture

```
Browser (React PWA)
   │  HTTPS, SWA-issued session cookie
   ▼
Azure Static Web App  ── serves static files
   │  ── enforces route roles from staticwebapp.config.json
   │  ── injects x-ms-client-principal on /api/* calls
   ▼
Managed Azure Functions (Node.js, TypeScript)  /api/*
   │  ── re-checks role, validates input, applies business rules
   │  ── connects with an Entra ID service principal, no connection string or account key
   ▼
Azure Cosmos DB (NoSQL, free tier)  one database, one container
```

Design points:

- **Single Static Web App resource** with the API deployed as managed functions. No separate Function App, no VM, no container.
- **Region:** UK South for both resources.
- **Client** is a single-page app. All data access goes through `/api/*`. The client never talks to Cosmos DB directly and holds no secrets.
- **API** is a small set of HTTP-triggered functions. Every handler follows the same pattern: resolve the caller, check role, validate body with a schema, perform the operation, return JSON.
- **Caller resolution is one function.** `getCaller(req)` reads `x-ms-client-principal` and returns `{ memberId, role, familyId }`. Handlers never read the header themselves. In v2 this same function can accept a service credential for the home server without touching any handler.
- **Database** is one Cosmos DB container with partition key `/familyId` and a `type` field discriminating documents (`event`, `list`, `item`, `task`, `meal`, `plan`, `member`). One family means one hot partition, which is fine at this scale.
- **Configuration** lives in SWA application settings: the database endpoint and names, the service principal's tenant, client id and secret (S18), and any Google calendar feed addresses (S30).

### 6.1 Cost estimate

| Resource             | Tier                         | Expected monthly cost                                                                   |
|----------------------|------------------------------|-----------------------------------------------------------------------------------------|
| Static Web App       | Free                         | £0 (100 GB bandwidth, managed functions, custom domain, invitations for up to 25 users) |
| Cosmos DB            | Free tier (1000 RU/s, 25 GB) | £0 (one free-tier account per subscription)                                             |
| Custom domain        | Existing or new registrar    | £0 to £12 per year                                                                      |
| Application Insights | Pay as you go                | £0 within the 5 GB free monthly allowance                                               |

Alert on subscription spend above £5 per month so a mistake is noticed early.

---

## 7. Security requirements

These are requirements, not suggestions. Each one has an acceptance check in Section 12.

### 7.1 Authentication

- S1. No application-managed passwords, password resets or account creation. All of that is the identity provider's job.
- S2. Only one identity provider is enabled. The login routes for every other provider (`/.auth/login/github`, `/.auth/login/twitter`, and so on) return 404 via a route rule in `staticwebapp.config.json`.
- S3. Invitation-only membership. Logging in with the provider is necessary but not sufficient. The user must also hold the `member` or `admin` role, which is only granted through an invitation.
- S4. Invitations expire within 24 hours and are single-use.

### 7.2 Authorisation

- S5. Route-level protection in `staticwebapp.config.json` covers every path, including `/api/*`. The default rule for `/*` requires an authenticated role. Only `/login`, `/.auth/*`, and hashed static assets are excepted.
- S6. Every API function independently parses `x-ms-client-principal`, rejects requests with no principal or no accepted role, and never trusts a user id or role sent in the request body.
- S7. Admin-only operations (invite, remove member, delete list, export) check for the `admin` role inside the function, not just at the route.
- S8. Every write records `createdBy` / `updatedBy` from the principal, never from client input.

### 7.3 Transport and browser hardening

- S9. HTTPS only. SWA enforces this and sets HSTS. Do not disable it.
- S10. Security headers set via `globalHeaders` in `staticwebapp.config.json`:
  - `Content-Security-Policy` with `default-src 'self'`, no inline scripts, no third-party script or font origins. If a CDN font is wanted, self-host it instead.
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` denying camera, microphone, geolocation, payment.
- S11. No third-party analytics, tag managers, tracking pixels or embedded widgets. Application Insights, if used, is loaded only server-side in the functions.
- S12. The SWA session cookie is set by the platform as `HttpOnly`, `Secure`, `SameSite`. The app must not create its own auth cookies or store tokens in `localStorage`.

### 7.4 Input handling and data

- S13. Every API request body is validated against a schema (for example Zod) before use. Unknown fields are stripped. String lengths are capped (titles 200 characters, notes 2000 characters).
- S14. All user-entered text is rendered as text, never as HTML. No `dangerouslySetInnerHTML`. Markdown rendering, if ever added, must use a sanitising renderer.
- S15. Cosmos DB queries use parameterised queries only. No string-concatenated query text.
- S16. Every query is scoped to the caller's `familyId` even though v1 has one family. This is the multi-tenant safety rail.
- S17. Deleting a member does not delete their contributions but does immediately revoke their role, ending API access on their next request.

### 7.5 Secrets and infrastructure

- S18. The functions connect to Cosmos DB as a dedicated Entra ID service principal holding only the `Cosmos DB Built-in Data Contributor` role on this account. Cosmos DB account keys are disabled, and no keys or connection strings exist in code, config or CI. The client secret lives in SWA application settings (S19) and is rotated before it expires, at least yearly. Managed identity would be preferred but is not available to SWA managed functions; if the API moves to a linked Function App (Section 15.4), switch to it and delete the secret.
- S19. If any secret is ever required (for example a v2 mail API key), it lives in SWA application settings or Key Vault, never in the repository. A secret-scanning pre-commit hook (`gitleaks` or equivalent) runs in CI.
- S20. Cosmos DB has public network access limited to Azure services, or a private endpoint if the tier allows. Local development uses the Cosmos DB emulator, not the production database.
- S21. The Azure subscription has MFA enforced on every owner account.
- S22. Dependencies are pinned via lockfile, Dependabot or Renovate is enabled, and `npm audit` failing on high severity blocks the CI build.

### 7.6 Logging, monitoring and backup

- S23. Every API request logs method, route, status, latency and the caller's user id. Never log request bodies, tokens or the raw client principal header.
- S24. Failed authorisation attempts (valid login, missing role) are logged at warning level so a stray invitation link being used can be noticed.
- S25. Cosmos DB periodic backup is left at defaults (every 4 hours, 8 hours retention) at minimum. Additionally the admin "Export all data" JSON is downloaded and kept by a parent at least monthly. A scheduled export to Blob Storage is a v2 candidate.
- S26. A budget alert is configured on the subscription.

### 7.7 Privacy

- S27. The system stores only what the features need: display name, email (from the provider), role, and the family's own content. No date of birth, no addresses beyond free-text event locations, no photos.
- S28. Data about children is entered by their parents and only visible to invited family. There is no public or shareable surface in v1.
- S29. An admin can delete all data for the family in one action (empty the container). This satisfies the family's own right to erasure and makes decommissioning clean.
- S30. A Google calendar feed address is a secret: anyone holding it can read that calendar. It lives only in application settings (S19), is never sent to the browser and is never logged (S23). Only `https://calendar.google.com/` addresses are fetched, so a bad setting cannot point the API elsewhere. If an address leaks, reset it in Google Calendar and update the setting.

---

## 8. Non-functional requirements

- **Mobile first.** Designed for a 390 px wide phone screen first, then scaled up. Every action reachable with a thumb.
- **Installable.** Web app manifest and a service worker that caches the app shell, so the site can be added to a phone home screen and opens instantly. API responses are not cached by the service worker.
- **Performance.** First meaningful paint under 1.5 seconds on 4G. Initial JavaScript bundle under 200 KB gzipped. Any single API call under 300 ms at the 95th percentile.
- **Accessibility.** Keyboard operable, visible focus states, form fields labelled, colour never the only carrier of meaning, contrast ratio 4.5:1 or better.
- **Timezone.** All display in the browser's local zone. The household is in `Europe/London`; the app must handle the two clock changes per year correctly for both timed and all-day events.
- **Language.** English (UK) only. Dates displayed as `Mon 14 Sep`, times as 24-hour.
- **Browser support.** Current versions of Safari on iOS, Chrome on Android, and Chrome, Firefox and Edge on desktop. No Internet Explorer.
- **Data limits.** Assume up to 5,000 events, 50 lists, 10,000 items, 5,000 tasks, 300 meals and 3,000 plan entries over the app's life. Nothing needs pagination in v1 beyond limiting agenda and done views to a date range.

---

## 9. Data model

All documents share: `id` (UUID), `familyId`, `type`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`. Dates are ISO 8601 strings.

```
member   { displayName, email, role: "admin"|"member", colour, lastLoginAt, active: bool }

event    { title, allDay: bool,
           start, end,              // "YYYY-MM-DD" if allDay, else UTC instant
           tz: "Europe/London",
           assignees: [memberId],
           location?, notes?,
           recurrence?: { freq: "daily"|"weekly"|"monthly", interval: n, until?, exceptions: [date] } }

list     { name, sortOrder, archived: bool }

item     { listId, name, note?, category?, checked: bool, checkedAt?, checkedBy? }

task     { title, dueDate?, assignee?, notes?, done: bool, completedAt?, completedBy? }

meal     { name, ingredients: [{ text, category? }], link?, notes?, tags: [string],
           lastPlannedAt?, archived: bool }

plan     { date: "YYYY-MM-DD", slot: "breakfast"|"lunch"|"dinner",
           mealId?, text?,          // exactly one of mealId or text is set
           cook?: memberId, note? }
```

Plan entries are keyed so that `(familyId, date, slot)` is unique. Settings that are family-wide (enabled meal slots, default shopping list) live on a single `settings` document with `id = "settings"`.

Soft delete is not needed. Deletes are real, and the periodic backup plus manual export cover mistakes.

---

## 10. API surface

All routes under `/api`, JSON in and out, role `member` or `admin` unless marked.

| Method | Route | Purpose |
|---|---|---|
| GET | `/me` | Current user's member record and role |
| GET | `/events?from=&to=` | Events overlapping a date range, recurrence expanded server-side |
| GET | `/external-events?from=&to=` | Read-only events from connected Google calendars, recurrence expanded server-side |
| POST | `/events` | Create event |
| PUT | `/events/{id}` | Update event (query `scope=this|future` for recurring) |
| DELETE | `/events/{id}` | Delete event or one occurrence (`?date=`) |
| GET | `/lists` | All lists with unchecked counts |
| POST | `/lists` | Create list (admin) |
| DELETE | `/lists/{id}` | Delete list and its items (admin) |
| GET | `/lists/{id}/items` | Items on a list |
| POST | `/lists/{id}/items` | Add item |
| PATCH | `/items/{id}` | Update or check/uncheck item |
| DELETE | `/lists/{id}/items?checked=true` | Clear done items |
| GET | `/tasks?view=mine|all|done` | Tasks |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/{id}` | Update or complete task |
| DELETE | `/tasks/{id}` | Delete task |
| GET | `/meals?q=&tag=` | Meal library, most recently planned first |
| POST | `/meals` | Create meal |
| PATCH | `/meals/{id}` | Update meal |
| DELETE | `/meals/{id}` | Archive meal (admin) |
| GET | `/plan?week=YYYY-MM-DD` | Plan entries for the week starting on that Monday |
| PUT | `/plan/{date}/{slot}` | Set or replace a cell |
| DELETE | `/plan/{date}/{slot}` | Clear a cell |
| POST | `/plan/copy-week` | Copy previous week into the given week (`{ "week": "YYYY-MM-DD" }`) |
| POST | `/plan/shop` | Add ingredients to a list (`{ "listId", "mealIds" | "week" }`), returns added and skipped counts |
| GET | `/settings` | Family-wide settings |
| PATCH | `/settings` | Update settings (admin) |
| GET | `/members` | Members (admin) |
| POST | `/members/invite` | Create an invitation (admin) |
| DELETE | `/members/{id}` | Remove member (admin) |
| PATCH | `/members/me` | Update own display name and colour |
| GET | `/export` | Full JSON export (admin) |

Error responses use a consistent shape: `{ "error": "message", "code": "SHORT_CODE" }` with appropriate status codes (400 validation, 401 unauthenticated, 403 wrong role, 404 not found).

---

## 11. Technology stack and developer workflow

Chosen to match what has worked before on initweave.

- **Client:** React 18, TypeScript, Vite. Routing with React Router. State via TanStack Query for server data (gives caching, refetch on focus and polling for free). No global state library.
- **Styling:** Plain CSS modules or Tailwind. Whichever is chosen, no runtime CSS-in-JS.
- **API:** Azure Functions v4 programming model, Node 22, TypeScript, Zod for validation, `@azure/cosmos` with `DefaultAzureCredential`.
- **Testing:** Vitest for unit tests on both sides. Playwright for a small smoke suite (login redirect, add item, add event) run against a preview environment.
- **Repository:** GitHub, single repo, `main` branch protected. Directory layout: `/src` client, `/api` functions, `/infra` Bicep, `staticwebapp.config.json` at root.
- **Infrastructure as code:** A Bicep file creates the SWA, Cosmos DB account, database, container, role assignment for the API's service principal, and budget alert. Deployed once by hand; re-runnable.
- **CI/CD:** The GitHub Actions workflow generated by SWA. Pull requests get a preview environment automatically. Merges to `main` deploy to production. CI runs lint, type-check, unit tests and `npm audit` before deploy.
- **Local development:** SWA CLI (`swa start`) to emulate auth and routing, Functions Core Tools for the API, Cosmos DB emulator or a separate dev database. The SWA CLI's fake auth screen lets you pick a role locally.

---

## 12. Acceptance criteria

Each of these should be demonstrable before v1 is called done.

**Access**
- A1. Visiting the site logged out shows only the login page. Directly requesting `/api/tasks` returns 401.
- A2. Logging in with a provider account that has no invitation shows the "not a member" page. `/api/tasks` still returns 401 or 403.
- A3. An invited member sees the dashboard. A member calling `POST /api/lists` gets 403. An admin gets 201.
- A4. Requesting `/.auth/login/github` returns 404.
- A5. Removing a member makes their next API call fail.

**Features**
- A6. On a phone, add a shopping item in three taps from the home page.
- A7. Two browsers logged in as different members: an item checked in one appears checked in the other within 30 seconds without a reload.
- A7a. On an iPhone, tapping "Copy" on a list with three unchecked and two checked items, then pasting into Notes, gives exactly the three unchecked items, one per line.
- A8. A weekly recurring event created on a Monday appears on the next eight Mondays in the month view, and deleting one occurrence leaves the others.
- A9. An all-day event on the day the clocks change displays on the correct day.
- A9d. With a Google calendar connected, a weekly timed event and an all-day event from it appear on the correct days in the month view and dashboard, marked as Google events with no edit or delete controls. No browser request goes to a Google domain, and the feed address appears in no API response or log line. With the feed address made invalid, the planner's own events still display and the calendar shows "Google calendar unavailable".
- A9a. Plan "Spaghetti bolognese" for Wednesday dinner, tap "Add ingredients to list" with two of its five ingredients already unchecked on Groceries. Groceries gains exactly three items, each with the meal name in its note, and the toast reports "Added 3, skipped 2".
- A9b. Wednesday's lunch and dinner appear on the dashboard on Wednesday and not on Tuesday. At 16:00 on Tuesday the dashboard also shows Wednesday's lunch. On a phone the week view shows seven days, each with both slots, without horizontal scrolling.
- A9c. "Copy last week" onto a week that already has Friday filled leaves Friday untouched and fills the other six days.
- A10. Export downloads a JSON file that contains every event, list, item, task, meal, plan entry and member.

**Security and operations**
- A11. Response headers on the home page include CSP, nosniff, frame options and referrer policy as specified.
- A12. A request body with an extra field `"role": "admin"` on `PATCH /api/members/me` does not change the role.
- A13. A title of 10,000 characters is rejected with 400.
- A14. `grep` of the repository for the Cosmos DB account key returns nothing, and the CI secret scan passes.
- A15. Application Insights shows a request log line with user id and status for an API call, and no line containing a request body.
- A16. Lighthouse on the home page: performance 90+, accessibility 95+, installable PWA passes.

---

## 13. Open decisions

Decide these before building. Defaults are stated so work can proceed without them.

- **D1. Identity provider.** Default: Microsoft accounts via the built-in Entra ID provider on the free tier. Every family member then needs a Microsoft account (a free outlook.com account works). Alternative: Google sign-in via a custom OpenID Connect provider, which requires the SWA Standard tier (about £7 per month) and the same invitation model. Second alternative: keep SWA but do auth with Supabase magic links as on initweave, which works with any email but moves S1 to S6 into your own code and means SWA route rules cannot protect the API. Recommendation: Microsoft accounts unless the family strongly prefers Google. Both Microsoft and Google can also act as the login for self-hosted services on a home server (via Authelia, Authentik or similar), so either choice supports single sign-on across both in v2. The Supabase option does not.
- **D2. Database.** Default: Cosmos DB NoSQL free tier. Alternative: Azure Table Storage, which is simpler and a few pence per month but has weaker querying, which makes date-range calendar queries clumsier. Recommendation: Cosmos DB, provided the free tier is not already used by another account in the subscription.
- **D3. Styling.** CSS modules or Tailwind. No functional impact.
- **D4. Custom domain.** Use a subdomain of an existing family domain, or the default `*.azurestaticapps.net` host. A custom domain is free on SWA and makes the login flow look less alarming to family members.
- **D5. Children as users.** Do the children get their own logins in v1, or are they only assignees without accounts? Default: assignees without accounts. This keeps the account count to two and avoids creating provider accounts for young children.
- **D6. Source of truth in v2.** When the home server arrives, does the planner data stay in Azure with the home server as a consumer, or move home with Azure as a front end? Default: stays in Azure. The planner must keep working when the house has a power cut or the server is being rebuilt, which is exactly when a family most needs its calendar. See Section 15.
- **D7. Meal slots.** Decided: Lunch and Dinner are both planned from v1 and cannot be disabled. Breakfast exists in the data model and is switchable on in settings, off by default.
- **D8. Google calendar display.** Decided: read the secret iCal feed on the server. Google's embedded calendar iframe was rejected because it needs a third-party `frame-src`, breaks S10 and S11, and cannot merge with planner events. The Google Calendar API with OAuth was rejected because it needs a Google Cloud project and a per-user consent flow for a read-only display. If writing to Google is wanted later, the API is the route.

---

## 14. Milestones

1. **Skeleton (week 1).** Repo, Bicep infra, SWA deployed with auth and route rules, `/api/me` returning the principal. Acceptance A1 to A4 pass with an empty app.
2. **Shopping lists (week 2).** Full lists and items feature, polling, mobile layout. A6, A7.
3. **To-dos (week 3).** Tasks feature and dashboard. A12, A13.
4. **Calendar (weeks 4 and 5).** Views, events, recurrence, Google calendar display. A8, A9, A9d.
5. **Meal planning (week 6).** Meal library, week plan, dashboard tie-in, ingredients to shopping list. A9a to A9c.
6. **Admin and hardening (week 7).** Members page, settings, invitations, export, headers, logging, budget alert, Lighthouse. Remaining acceptance criteria.

---

## 15. v2 outlook: home server integration

A future home server (document storage, smart home, media, and so on) will want to talk to the planner. This section answers "does that change v1?" The short answer: the v1 architecture is right for it, and four small choices below keep the integration cheap later. Nothing about the hosting decision changes.

### 15.1 Principles

- **The planner stays in Azure and stays the source of truth** for events, lists and tasks (D6). The home server is a consumer and, optionally, a contributor. Availability is the reason: a self-hosted planner is down whenever the house is.
- **The home server is never exposed to the public internet directly.** Anything the planner needs from it is reached through a tunnel (Cloudflare Tunnel, Tailscale Funnel or Entra Application Proxy), and the tunnel endpoint is called only from the Functions API, never from the browser. This keeps the browser CSP at `connect-src 'self'` and keeps the home server's address out of the client bundle.
- **The planner degrades gracefully.** If the home server is unreachable, every v1 feature still works. Integration features show "unavailable" rather than erroring.
- **One family identity.** Family members log in once. The identity provider chosen in D1 is the one the home server's services federate to, so nobody has a second password.

### 15.2 Likely integration shapes

| Direction | Example | Mechanism |
|---|---|---|
| Home server pulls from planner | Nightly backup of the JSON export to the NAS; calendar shown on a kitchen display; Home Assistant automation "bins go out" from a recurring task | Home server calls `/api/export` or `/api/events` with a service credential |
| Home server pushes to planner | Smart speaker adds "milk" to Groceries; a document scanner creates a task "file the car insurance" | Home server calls `POST /api/lists/{id}/items` with a service credential |
| Planner pulls from home server | Attach a document from home storage to an event; show whether the front door is locked on the dashboard | Functions API calls the home server through the tunnel with a secret from Key Vault |

### 15.3 What v1 does to prepare (already in scope)

These are cheap now and expensive to retrofit.

1. **Single caller-resolution function** (Section 6). Adding a second credential type is one change in one place.
2. **`familyId` on every document and every query** (S16). A home server that serves more than one household later, or a second family on the same planner, needs no data migration.
3. **Every document carries `updatedAt`** (Section 9), which makes a `GET /api/changes?since=` endpoint trivial to add for incremental sync. Cosmos DB also exposes `_ts` on every document.
4. **The JSON export exists and is complete** (A10). The first integration is almost certainly "back this up to the NAS every night", and it requires no new planner code.

### 15.4 What changes at v2 (not in scope now)

- **Machine-to-machine authentication.** The built-in Static Web App login is user-interactive only, and managed functions are not reachable without a session cookie. Two paths, choose then:
  - Keep managed functions and add a small set of `/api/integration/*` routes marked `anonymous` in `staticwebapp.config.json`, each verifying a long random bearer token stored in SWA application settings inside the function. Simple, adequate for one trusted server on the home network. Rotate the token yearly.
  - Move the API to a standalone Function App linked to the SWA ("bring your own functions", Standard tier). The Function App can then validate Entra ID client-credential tokens issued to the home server, which is the proper answer if the integration surface grows. The Functions code moves unchanged.
- **Secrets.** Any home server secret or tunnel token lives in Key Vault, referenced from application settings (S19 already requires this).
- **Rate limiting and audit.** Integration routes log the service name as the caller (S23) and are rate-limited per token.
- **Tunnel choice.** Decided with the home server, not now. The planner only needs an HTTPS hostname and a credential.

### 15.5 What does not change

Hosting on Static Web Apps, Cosmos DB, the identity provider model, the data model, the security requirements and every acceptance criterion in this document all stand. The home server plan is a reason to be strict about S16 and the single caller function, not a reason to change the platform.

---

## Appendix A. Starter `staticwebapp.config.json`

This encodes S2, S5, S9 and S10 and can be dropped in on day one.

```json
{
  "routes": [
    { "route": "/.auth/login/github",   "statusCode": 404 },
    { "route": "/.auth/login/twitter",  "statusCode": 404 },
    { "route": "/.auth/login/google",   "statusCode": 404 },
    { "route": "/.auth/login/facebook", "statusCode": 404 },
    { "route": "/.auth/*",              "allowedRoles": ["anonymous", "authenticated"] },
    { "route": "/login",                "allowedRoles": ["anonymous", "authenticated"] },
    { "route": "/not-a-member",         "allowedRoles": ["anonymous", "authenticated"] },
    { "route": "/assets/*",             "allowedRoles": ["anonymous", "authenticated"] },
    { "route": "/manifest.webmanifest", "allowedRoles": ["anonymous", "authenticated"] },
    { "route": "/api/members/*",        "allowedRoles": ["admin"] },
    { "route": "/api/export",           "allowedRoles": ["admin"] },
    { "route": "/api/*",                "allowedRoles": ["member", "admin"] },
    { "route": "/*",                    "allowedRoles": ["member", "admin"] }
  ],
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/api/*", "/.auth/*"]
  },
  "responseOverrides": {
    "401": { "redirect": "/.auth/login/aad?post_login_redirect_uri=.referrer", "statusCode": 302 },
    "403": { "rewrite": "/not-a-member" }
  },
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
  }
}
```

Note: `/api/members/me` must be handled before the `/api/members/*` admin rule if members are allowed to update their own profile. Either give it its own earlier route entry with `["member", "admin"]`, or move the self-update to `/api/me`. The second is simpler.
