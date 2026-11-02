# FamilyPlanner — Requirements Document
**Version:** 0.5 (v1 scope)
**Status:** Draft
**Last updated:** 1 November 2026

---

## 1. Overview

FamilyPlanner is a small private website for one household. It gives every family member a shared calendar, shopping lists, to-do lists, a weekly chore schedule, a weekly meal plan and the family's recipes, all in sync across phones and laptops. It is hosted on Azure Static Web Apps, costs close to nothing to run, and is reachable only by invited family members after a simple login.

The product is deliberately small. It is not a general-purpose SaaS product. There is one family, a handful of users, and a strong preference for "boring", well-supported building blocks over clever ones. Security is a first-class requirement because the data describes where the family will be and when.

---

## 2. Goals

- A family member can open the site on a phone and see today's events, tonight's dinner, open shopping items and their own to-dos within two seconds of login.
- Adding a shopping item or task takes fewer than three taps.
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
- Creating, editing or deleting events in the planner, and writing to Google Calendar. Google Calendar is the single source of truth for events; the planner only displays them (Section 5.3).
- Budgeting, chores with rewards, recurring or tracked chores, photo sharing. All possible later, none in v1.
- Structured recipe data: nutrition information, portion scaling, ingredients as records. Recipes are plain text (Section 5.8) and the meal plan stays a plan of plain text.
- Offline editing. The app should load its shell offline but does not need to queue writes.
- Any AI features.
- Integration with a home server (document storage, smart home). Planned for v2; Section 15 records what v1 does now to keep that door open.

---

## 4. Users and roles

**Household size:** two adults and up to four children. Assume a maximum of ten accounts.

| Role | Who | Can do |
|---|---|---|
| `admin` | Parents | Everything a member can do, plus invite and remove members, delete lists, export all data. |
| `member` | Other family members | Create, edit and complete list items and tasks. See everything. |

Notes:

- Every user is assigned to exactly one of the two roles at invitation time.
- There is no anonymous role. An unauthenticated visitor sees only a login page.
- A "child" role with reduced capabilities (for example, complete tasks but not delete lists) is a v2 candidate. Design the authorisation check as a single function so adding a role is a one-place change.

---

## 5. Feature specifications

### 5.1 Authentication and access

- Login uses the built-in authentication of Azure Static Web Apps. The app never sees or stores a password.
- Exactly one identity provider is enabled for v1. The default recommendation is Microsoft accounts (Entra ID, personal and work accounts). See Open Decision D1 for the alternative.
- Access is invitation-only. An admin adds an email address and role on the Members page; that person then signs in with the Microsoft account for that address. No link is sent.
- A user who logs in with a valid provider account but has not been invited is shown a "not a member of this family" page and has no access to any data or API route.
- All routes except `/login`, `/.auth/*` and static assets require a signed-in user. This is enforced in `staticwebapp.config.json`, not only in client-side code. The app shell is therefore loadable by any signed-in provider account, but it contains no family data.
- Every API route also requires a signed-in user in the same config file, and membership and role are checked inside the function on every request (S3).
- Logout is a visible button that calls `/.auth/logout` and returns the user to the login page.
- Session lifetime follows the SWA default. The app must handle a 401 from any API call by redirecting to login rather than showing a broken screen.

### 5.2 Home (dashboard)

The landing page after login. It answers "what's happening today?" first and lets the common jobs be done in place.

- A greeting and today's date.
- A Today card: today's events in time order (past ones dimmed), today's lunch and dinner (and breakfast if enabled) as editable fields, and the current user's open tasks due today or overdue, each completed with one tap.
- The next six days, one line each: that day's events and dinner. Tapping a day opens it with the same detail as Today, so tomorrow's dinner can be planned without leaving the page. From 15:00 tomorrow is open by default, since packed lunches are prepared the evening before. 
- This week's chores and who has each one, linking to the schedule. Hidden until there are chores.
- A tile per shopping list with its unchecked count, linking to the list.
- A floating add button in thumb reach opens a sheet: type text, choose shopping or to-do, submit. It stays open for adding several things and defaults to the most recently used type.

### 5.3 Calendar

Google Calendar is the single source of truth for events. The planner displays them and never creates, changes or deletes them. A button opens Google Calendar for adding or changing events.

- Views: month, week and agenda (a scrolling list of upcoming events). Agenda is the default on phones, month on larger screens. On a phone, tapping a day in the month view opens its list.
- Each connected calendar is read from its Google "Secret address in iCal format", which works for a private calendar without any Google login inside the planner.
- The API fetches and parses the feed on the server. The browser never contacts Google and never receives the feed address, so the CSP is unchanged (S10) and nothing is embedded (S11).
- Events show on the calendar and dashboard with their title, time, all-day flag and location. Tapping one shows its details, with no edit or delete controls.
- Recurring events, exceptions and all-day events in the feed display on the correct dates, including across the clock changes (Section 8).
- With two or more calendars connected, events carry their calendar's label as well as its colour (never colour alone) and the calendar can be filtered by calendar. "All" is the default.
- Invites sent to the family address from any calendar system reach the Family calendar through a small script in the owner's Google account (`infra/family-invites.gs`), so events can be added remotely while Google stays the source of truth.
- Connected calendars are configured by the `GOOGLE_CALENDARS` application setting, a JSON list of `{ "label", "url" }` (S19), not through the UI. Every member sees every connected calendar.
- Feed contents are cached in memory for up to 15 minutes and are not written to the database, so a Google event's changes appear within 15 minutes and the export (A10) is unaffected.
- If a feed cannot be fetched or parsed, the rest of the planner keeps working and the calendar shows "Google calendar unavailable" rather than an error. The last good cached copy may be shown instead.

Events created before this decision remain as `event` documents, are no longer displayed, and appear in the export.

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
- Chores are not tasks. They have their own weekly schedule (Section 5.9), shown as a tab on this page.

### 5.6 Meal planning

A week-at-a-glance plan of what the family is eating, as plain text.

- The plan is a grid of days by slots. Lunch and Dinner are enabled by default. An admin can enable Breakfast in settings. Slots always display in the order Breakfast, Lunch, Dinner.
- Views: the current week (Monday to Sunday) with previous and next week navigation. On a phone, a vertical list of days, each showing its Lunch and Dinner rows; on a larger screen, seven columns.
- Each cell holds zero or one line of free text ("Roast chicken", "Leftovers", "Eating at Grandma's"). Every cell is a text field: tap and type. Enter saves and moves to the next cell, leaving the field saves, Escape abandons the edit, and emptying a field clears the cell.
- Drag and drop between cells on desktop. On a phone, a move button on a filled cell picks a target day. Moving onto a filled cell swaps the two.
- "Copy last week" fills the current week from the previous one, skipping cells already filled.
- Any member can plan.
- A cell whose text is exactly a recipe's title (ignoring case) shows a link to that recipe. Nothing else ties the two together, so copying weeks works as before and renaming a recipe only drops the link.

Cells saved while the app had a meal library hold a `mealId` rather than text. The API returns the name of the old meal as their text and they become ordinary text when edited or copied. The old `meal` documents stay in the database, read-only, and appear in the export.

### 5.7 Members and settings (admin only)

- List of members with name, email, role, last login.
- Invite a new member: email and role. They then sign in with that email.
- Remove a member. Their historical actions remain attributed by display name.
- Each member can set their own display name and colour.
- Planning settings: whether Breakfast is enabled (Lunch and Dinner are always on) and the default shopping list for quick add.
- "Export all data" downloads a single JSON file containing every record. This doubles as the manual backup mechanism.
- Import recipes from an org file (Section 5.8).

### 5.8 Recipes

The family's recipes, kept in the app. They have their own item in the top navigation on larger screens. On a phone they are a tab beside the plan, so the bottom bar stays at five items.

- A recipe has a title (required), summary, serves, time, source, tags, ingredients, method and notes. Serves and time are free text ("~8 pancakes", "6 hours 15 minutes plus resting time"). A recipe can be as little as a title and a link.
- Ingredients, method and notes are plain text, one entry per line. A line ending in a colon is a subheading, which is how a cake and its glaze, or a sub-recipe, are kept apart. Method numbering restarts after a subheading.
- The list can be searched by title, tag or ingredient and filtered by tag.
- A source containing an `http(s)` address links to it. Nothing else in a recipe is ever a link, and everything renders as text (S14).
- **Add to shopping.** A sheet lists the ingredients, all ticked, with the default list chosen. Untick what's in the cupboard and add the rest. Each ingredient line becomes one shopping item as written, without merging or quantities.
- **Put on the plan.** Choose a day and meal and the title is written to that plan cell. If the cell is filled, the sheet says what will be replaced.
- Any member can add, edit and delete recipes.
- **Import.** An admin chooses an org file in Settings: one recipe per top-level heading, with `Ingredients`, `Method`, `Notes` and `Variations` sections, lists or `| Amount | Ingredient |` tables, and a property drawer. Any other section is treated as a sub-recipe. The file is parsed in the browser and the recipes are created through the normal API, because the production database cannot be reached from outside Azure (S20). The app is the home of a recipe once imported. A title the app already has is skipped, so an import can be repeated after the file has grown and never overwrites an edit.
- **Daily intake.** Recipes texted to Hermes on the home server land in the org file. Once a day Hermes runs `infra/recipe-intake.sh`, which parses the file with the same parser and sends titles it has not sent before to `POST /api/integration/recipes` (S31). It keeps its own record of what it has sent, so a recipe deleted or renamed in the app does not come back. It runs without the AI model, messages only when something was added or refused, and is silent otherwise. A failed run sends nothing to the record, so it is retried the next day.

### 5.9 Chores

A display of who has which chore each week. It records the plan and nothing else: any adult can do any chore, so there is no completing, no reminding and no rotation.

- The family keeps one list of chores by name. Any member can add, rename or delete them. Deleting a chore removes it from every week.
- The page shows one week at a time, Monday to Sunday, with previous and next navigation like the meal plan. Larger screens have a Chores item in the top navigation, and on a phone it is a tab on the To-dos page. Each chore shows the family's people as chips. Tap one to assign the chore for that week and tap again to clear it.
- A chore has at most one person per week. With nobody assigned it reads as "Anyone".
- "Copy last week" fills unassigned chores from the previous week, leaving those already set, and skips anyone who has since been removed.

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
- **Region:** Cosmos DB in UK South, so the data stays in the UK. Static Web Apps is not offered in UK South, so the SWA and its functions run in West Europe, the nearest region.
- **Client** is a single-page app. All data access goes through `/api/*`. The client never talks to Cosmos DB directly and holds no secrets.
- **API** is a small set of HTTP-triggered functions. Every handler follows the same pattern: resolve the caller, check role, validate body with a schema, perform the operation, return JSON.
- **Caller resolution is one function.** `getCaller(req)` reads `x-ms-client-principal` and returns `{ memberId, role, familyId }`. Handlers never read the header themselves. In v2 this same function can accept a service credential for the home server without touching any handler.
- **Database** is one Cosmos DB container with partition key `/familyId` and a `type` field discriminating documents (`list`, `item`, `task`, `plan`, `recipe`, `chore`, `choreWeek`, `member`). One family means one hot partition, which is fine at this scale.
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
- S3. Invitation-only membership. Logging in with the provider is necessary but not sufficient. The user must also have an active member record, which only an admin can create, and that record holds their role. The API checks it on every request. SWA invitation roles are not used, because they were observed to be intermittently missing from valid sessions.
- S4. An invitation is a member record with an email and no linked account. It links to the first account that signs in with that email and cannot be claimed by another account afterwards. Invitations do not expire; an admin removes an unused one.

### 7.2 Authorisation

- S5. Route-level protection in `staticwebapp.config.json` covers every path, including `/api/*`. The default rule for `/*` requires a signed-in user. Only `/login`, `/.auth/*`, and hashed static assets are excepted. Family data is protected by the membership check in S3 and S6.
- S6. Every API function independently parses `x-ms-client-principal`, rejects requests with no principal or no active member record, and never trusts a user id or role sent in the request body.
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

- S13. Every API request body is validated against a schema (for example Zod) before use. Unknown fields are stripped. String lengths are capped (titles 200 characters, notes 2000 characters, recipe ingredients, method and notes 10,000 characters each).
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

- S27. The system stores only what the features need: display name, email (from the provider), role, and the family's own content. No date of birth, no addresses, no photos.
- S28. Data about children is entered by their parents and only visible to invited family. There is no public or shareable surface in v1.
- S29. An admin can delete all data for the family in one action, leaving only that admin's own member record so they can still sign in. This satisfies the family's own right to erasure and makes decommissioning clean.
- S30. A Google calendar feed address is a secret: anyone holding it can read that calendar. It lives only in application settings (S19), is never sent to the browser and is never logged (S23). Only `https://calendar.google.com/` addresses are fetched, so a bad setting cannot point the API elsewhere. If an address leaks, reset it in Google Calendar and update the setting.
- S31. A service on the home server calls the API through `/api/integration/*` with a long random token in the `x-integration-token` header. That path is the only API path open at the SWA edge, so the token is its only protection. It is at least 32 characters, lives in application settings and in a file readable only by its owner on the home server, and is compared in constant time. With no token configured, every request is refused. The token can add recipes and nothing else: it reads no family data, and a signed-in session does not stand in for it.

---

## 8. Non-functional requirements

- **Mobile first.** Designed for a 390 px wide phone screen first, then scaled up. Every action reachable with a thumb.
- **Installable.** Web app manifest and a service worker that caches the app shell, so the site can be added to a phone home screen and opens instantly. API responses are not cached by the service worker.
- **Performance.** First meaningful paint under 1.5 seconds on 4G. Initial JavaScript bundle under 200 KB gzipped. Any single API call under 300 ms at the 95th percentile.
- **Accessibility.** Keyboard operable, visible focus states, form fields labelled, colour never the only carrier of meaning, contrast ratio 4.5:1 or better.
- **Timezone.** All display in the browser's local zone. The household is in `Europe/London`; the app must handle the two clock changes per year correctly for both timed and all-day events.
- **Language.** English (UK) only. Dates displayed as `Mon 14 Sep`, times as 24-hour.
- **Browser support.** Current versions of Safari on iOS, Chrome on Android, and Chrome, Firefox and Edge on desktop. No Internet Explorer.
- **Data limits.** Assume up to 50 lists, 10,000 items, 5,000 tasks, 3,000 plan entries, 500 recipes and 5,000 chore weeks over the app's life. Nothing needs pagination in v1 beyond limiting agenda and done views to a date range.

---

## 9. Data model

All documents share: `id` (UUID), `familyId`, `type`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`. Dates are ISO 8601 strings.

```
member   { displayName, email, role: "admin"|"member", colour, lastLoginAt, active: bool }

list     { name, sortOrder, archived: bool }

item     { listId, name, note?, category?, checked: bool, checkedAt?, checkedBy? }

task     { title, dueDate?, assignee?, notes?, done: bool, completedAt?, completedBy? }

plan     { date: "YYYY-MM-DD", slot: "breakfast"|"lunch"|"dinner", text }

recipe   { title, summary?, serves?, time?, source?, tags: [string], ingredients, method, notes }

chore    { name }

choreWeek { week: "YYYY-MM-DD" (the Monday), choreId, memberId }
```

Plan entries are keyed so that `(familyId, date, slot)` is unique, and chore weeks so that `(familyId, week, choreId)` is. Settings that are family-wide (enabled meal slots, default shopping list) live on a single `settings` document with `id = "settings"`.

Soft delete is not needed. Deletes are real, and the periodic backup plus manual export cover mistakes.

---

## 10. API surface

All routes under `/api`, JSON in and out, role `member` or `admin` unless marked.

| Method | Route | Purpose |
|---|---|---|
| GET | `/me` | Current user's member record and role |
| GET | `/external-events?from=&to=` | Read-only events from connected Google calendars, recurrence expanded server-side. Returns `{ calendars, events, unavailable }` |
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
| GET | `/plan?week=YYYY-MM-DD` | Plan entries for the week starting on that Monday |
| PUT | `/plan/{date}/{slot}` | Set or replace a cell |
| DELETE | `/plan/{date}/{slot}` | Clear a cell |
| POST | `/plan/copy-week` | Copy previous week into the given week (`{ "week": "YYYY-MM-DD" }`) |
| GET | `/recipes` | All recipes |
| POST | `/recipes` | Create recipe |
| PATCH | `/recipes/{id}` | Update recipe |
| DELETE | `/recipes/{id}` | Delete recipe |
| POST | `/integration/recipes` | Add recipes whose titles are new, for Hermes. Token, not a login (S31). Returns `{ added, skipped, failed }` |
| GET | `/chores?week=YYYY-MM-DD` | Chores and that week's assignments |
| POST | `/chores` | Create chore |
| PATCH | `/chores/{id}` | Rename chore |
| DELETE | `/chores/{id}` | Delete chore and all its weeks |
| PUT | `/chores/{id}/weeks/{week}` | Assign a member for that week |
| DELETE | `/chores/{id}/weeks/{week}` | Clear that week's assignment |
| POST | `/chores/copy-week` | Fill unassigned chores from the previous week (`{ "week": "YYYY-MM-DD" }`) |
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
- **Testing:** Vitest for unit tests on both sides. Playwright for a small smoke suite (login redirect, add item) run against a preview environment.
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
- A8. A weekly recurring event in the Google calendar appears on the correct days, and an occurrence deleted in Google does not.
- A9. An all-day event on the day the clocks change displays on the correct day.
- A9d. With a Google calendar connected, a weekly timed event and an all-day event from it appear on the correct days in the month view and dashboard, with no edit or delete controls. No browser request goes to a Google domain, and the feed address appears in no API response or log line. With the feed address made invalid, the rest of the planner keeps working and the calendar shows "Google calendar unavailable".
- A9a. On a phone, type a meal into an empty cell and press Enter. Focus moves to the next cell and the meal is still there after a reload. Emptying the cell clears it.
- A9b. Wednesday's lunch and dinner appear on the dashboard on Wednesday and not on Tuesday. At 16:00 on Tuesday the dashboard also shows Wednesday's lunch. On a phone the week view shows seven days, each with both slots, without horizontal scrolling.
- A9c. "Copy last week" onto a week that already has Friday filled leaves Friday untouched and fills the other six days.
- A9e. Importing the family's org file creates every recipe, and importing it again creates none. A recipe with subheadings, one with a sub-recipe and one with only a link all display correctly.
- A9h. `POST /api/integration/recipes` with no token or a wrong one returns 403 and writes nothing. With the token, a new title is added and an existing one left unchanged. A recipe deleted in the app is not added again by the next daily intake.
- A9f. From a recipe, unticking one ingredient and adding the rest puts exactly those on the chosen list. Putting the recipe on the plan makes that cell link back to it.
- A9g. A chore assigned this week appears on the dashboard with that person and is unassigned next week until "Copy last week" fills it, leaving any chore already assigned there untouched.
- A10. Export downloads a JSON file that contains every list, item, task, plan entry, recipe, chore, chore week and member.

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
- **D8. Google calendar display.** Decided: read the secret iCal feed on the server. Google's embedded calendar iframe was rejected because it needs a third-party `frame-src`, breaks S10 and S11, and cannot match the planner's views. The Google Calendar API with OAuth was rejected because it needs a Google Cloud project and a per-user consent flow for a read-only display. If writing to Google is wanted later, the API is the route. The planner keeps no events of its own, so there is one source of truth.

---

## 14. Milestones

1. **Skeleton (week 1).** Repo, Bicep infra, SWA deployed with auth and route rules, `/api/me` returning the principal. Acceptance A1 to A4 pass with an empty app.
2. **Shopping lists (week 2).** Full lists and items feature, polling, mobile layout. A6, A7.
3. **To-dos (week 3).** Tasks feature and dashboard. A12, A13.
4. **Calendar (weeks 4 and 5).** Views and Google calendar display. A8, A9, A9d.
5. **Meal planning (week 6).** Week plan and dashboard tie-in. A9a to A9c.
6. **Admin and hardening (week 7).** Members page, settings, invitations, export, headers, logging, budget alert, Lighthouse. Remaining acceptance criteria.

---

## 15. v2 outlook: home server integration

A future home server (document storage, smart home, media, and so on) will want to talk to the planner. This section answers "does that change v1?" The short answer: the v1 architecture is right for it, and four small choices below keep the integration cheap later. Nothing about the hosting decision changes.

### 15.1 Principles

- **The planner stays in Azure and stays the source of truth** for lists, tasks and meal plans (D6); Google Calendar is the source of truth for events. The home server is a consumer and, optionally, a contributor. Availability is the reason: a self-hosted planner is down whenever the house is.
- **The home server is never exposed to the public internet directly.** Anything the planner needs from it is reached through a tunnel (Cloudflare Tunnel, Tailscale Funnel or Entra Application Proxy), and the tunnel endpoint is called only from the Functions API, never from the browser. This keeps the browser CSP at `connect-src 'self'` and keeps the home server's address out of the client bundle.
- **The planner degrades gracefully.** If the home server is unreachable, every v1 feature still works. Integration features show "unavailable" rather than erroring.
- **One family identity.** Family members log in once. The identity provider chosen in D1 is the one the home server's services federate to, so nobody has a second password.

### 15.2 Likely integration shapes

| Direction | Example | Mechanism |
|---|---|---|
| Home server pulls from planner | Nightly backup of the JSON export to the NAS; calendar shown on a kitchen display; Home Assistant automation "bins go out" from a recurring task | Home server calls `/api/export` or `/api/external-events` with a service credential |
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
  - Keep managed functions and add a small set of `/api/integration/*` routes marked `anonymous` in `staticwebapp.config.json`, each verifying a long random token stored in SWA application settings inside the function. Simple, adequate for one trusted server on the home network. Rotate the token yearly. This path is in use for recipe intake (S31).
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
