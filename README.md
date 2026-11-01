# FamilyPlanner

A small private website for one household: shared calendar, shopping lists, to-dos and a weekly meal plan. See `req.md` for the full requirements. This is the v1 draft.

## Layout

```
src/                  React 18 + TypeScript + Vite client (PWA)
api/                  Azure Functions v4 (Node 22, TypeScript, Zod)
  src/lib/caller.ts   the single caller-resolution function (section 6)
  src/lib/store.ts    Store interface; MemoryStore (local) and CosmosStore (Azure)
  src/handlers/       one file per feature, pure (ctx, params, query, body) => result
  src/index.ts        every route from section 10, registered in one place
infra/main.bicep      SWA + Cosmos DB free tier + role assignment + budget alert (app settings are set by CLI)
staticwebapp.config.json   route roles, provider lockdown, security headers (Appendix A)
.github/workflows/    lint, type-check, tests, npm audit, secret scan, deploy
```

## Run locally

Two terminals:

```
npm --prefix api run dev      # builds and starts the Functions host on :7071
npm run dev                   # Vite on :5173, proxies /api and fakes /.auth
```

Open http://localhost:5173. You start logged out. The login page offers the dev identities: Tim and Jo (admins), Charlie and Robin (members), and Stranger (signed in but not invited, to see the not-a-member page). Switch at any time via `/.auth/dev?as=jo`.

Locally the API uses an in-memory store persisted to `api/.data/db.json`, seeded with a sample household. Delete that file to reseed. Production Cosmos DB only accepts connections from Azure datacentres (S20), so local development stays on this store.

How the dev auth works: Vite's proxy injects the same `x-ms-client-principal` header that Static Web Apps injects in production, and a tiny middleware serves `/.auth/me`, `/.auth/login/aad` and `/.auth/logout`. The API has no development-only code paths.

## Tests

```
npm test            # client unit tests, then api unit tests
npm run typecheck
```

API tests cover the acceptance criteria that can be checked without a browser: A1, A2, A5, A8, A9, A9a, A9c, A12, A13, plus DST handling of recurring events.

## Deploy

Azure managed functions cannot use a managed identity, so the API signs in to Cosmos DB as a service principal (S18).

Static Web Apps is not offered in UK South, so the app and its functions run in West Europe while Cosmos DB stays in UK South. `AZURE_STATIC_WEB_APPS_API_TOKEN` must exist before the first push to `main`.

1. Create the identity and note `appId`, `password` and `tenant`: `az ad sp create-for-rbac --name familyplanner-api`. Then get its object id: `az ad sp show --id <appId> --query id -o tsv`.
2. `az group create -n rg-familyplanner -l uksouth`
3. `az deployment group create -g rg-familyplanner -f infra/main.bicep -p apiPrincipalId=<object id> alertEmail=<you>`
4. Set the application settings, using the `cosmosEndpoint` output from step 3:
   `az staticwebapp appsettings set -n familyplanner --setting-names COSMOS_ENDPOINT=<endpoint> COSMOS_DATABASE=familyplanner COSMOS_CONTAINER=docs FAMILY_ID=home AZURE_TENANT_ID=<tenant> AZURE_CLIENT_ID=<appId> AZURE_CLIENT_SECRET=<password>`
5. Put the deployment token in GitHub: `az staticwebapp secrets list -n familyplanner --query properties.apiKey -o tsv | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN`
6. Push to `main`. The workflow runs the checks and deploys.
7. In the portal, Static Web App > Role management > Invite: one invitation per family member with role `admin` or `member`. Links expire after 24 hours.

Client secrets expire, by default after a year: `az ad sp credential reset --id <appId>`, then repeat the `AZURE_CLIENT_SECRET` part of step 4.

## Draft status and known gaps

- `CosmosStore` is written against the SDK but has not been run against a real account.
- Google calendar display (requirements section 5.3.1) is specified but not built.
- Invitations: the API records the expected member; the invitation link itself still comes from the portal (or the SWA management API in a later pass).
- Removing a member revokes API access immediately (S17) but the SWA role must also be removed in the portal.
- PNG icons (192 and 512) for the manifest are not generated yet; the SVG works in Chrome but iOS wants PNG.
- No ESLint config yet; CI runs type-check and tests.
- Playwright smoke suite (section 11) not written.
