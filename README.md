# Analytiq — AI visibility workspace

A foundation for the workflow in [ai-visibility-research.md](./ai-visibility-research.md): approved business memory → evidence → proposals → human approval → measurement.

The frontend uses **Next.js App Router** and React. The backend uses **Hono on Node.js with TypeScript**. These choices follow the requested stack and supersede the research's TanStack Start / Effect preference for this implementation. The research file is preserved.

## Run locally

Requires Node.js 22 or newer and npm. From the repository root:

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. The API listens on **http://127.0.0.1:4000**; its health endpoint is `/health`. Both services bind to loopback by default.

On Windows PowerShell, use `npm.cmd install` and `npm.cmd run dev` if script execution policy blocks `npm.ps1`. No execution policy changes are needed.

The login and signup pages can be previewed without credentials. Configure MongoDB and an authentication secret to create accounts and access the workspace. Google sign-in also requires Google OAuth credentials. See [authentication setup](./docs/authentication.md).

User accounts, password hashes, sessions, and Google account records are stored in MongoDB. Business project data remains in local JSON files under `.data/workspaces`, isolated by the authenticated user ID. The original `.data/workspace.json` is preserved as legacy data and is not automatically assigned to a new account. Start only one API process against the workspace directory.

Each MongoDB `user` document also has a `projects` array containing that user's project IDs, names, URLs, and creation timestamps. New projects sync automatically; existing projects can be synced with `npm run db:sync-projects -w @visibility/api`.

Optional environment overrides:

- Copy `.env.example` to `apps/api/.env` for MongoDB, authentication, Google OAuth, and API configuration. `WORKSPACE_DATA_DIR` is relative to `apps/api` when using the workspace scripts.
- Copy `apps/web/.env.example` to `apps/web/.env.local` to override the API origin. Rebuild the web app after changing its proxy configuration.
- The API accepts `http://localhost:3000` and `http://127.0.0.1:3000` by default. Set `WEB_ORIGIN` if you use another frontend port or hostname.

## What works

- Login and signup pages with email/password and Google sign-in through Better Auth, activated by server credentials.
- MongoDB-backed accounts and sessions, server-side dashboard protection, authenticated project APIs, sign-out, and account isolation.
- Multiple projects with a website and description.
- One project per website across all accounts, enforced by an atomic MongoDB website registry. URL variants and simultaneous submissions cannot create duplicates.
- Versioned business memory: positioning, audience, products, competitors, disallowed claims, and sourced claims approved by the local user.
- Prompt portfolios with engine, intent, locale, and priority. Prompts can be added and removed.
- Project overview, setup progress, activity records, memory history, and JSON exports.
- Validated API inputs, structured errors, project-scoped resource lookup, serialized atomic local storage writes, and API integration tests.
- Responsive dashboard with loading, error, and empty states.

Audit results, AI observations, review queues, and integrations have explicit empty or planned states. Their shared types and adapter boundaries exist; external jobs are not run. There are no fabricated visibility scores or answer observations.

## Structure

```text
apps/web                  Next.js dashboard and same-origin API proxy
apps/api                  Hono routes, local repository, and API tests
packages/core             Shared Zod schemas and domain types
packages/integrations     Answer collector, storage, and publishing contracts
packages/jobs             Job runner and isolated validation contracts
packages/database         Initial Postgres schema design
docs                      Architecture, API reference, and next milestones
```

## Check and build

```sh
npm run check
npm run build
npm start
```

`check` runs TypeScript checks, frontend lint, and API tests. `build` compiles the API and produces a production Next.js build. `start` runs both compiled services locally.

The installed Next.js ESLint configuration currently inherits the `braces` development-tool advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). It concerns processing deeply nested glob patterns during tooling runs. It is not a runtime dependency of the dashboard or API. npm currently suggests downgrading the Next.js lint configuration to a different major version; this base keeps the matching configuration and records the issue for an upstream update.

## Foundation boundaries

This is a **local development foundation** with MongoDB authentication and per-account project isolation. Team membership, email verification, password reset email delivery, MCP transport, crawler, provider adapters, billing, durable jobs, and publishing remain future work. Email/password signups do not verify email ownership yet; automatic linking between email and Google accounts is disabled. Keep the local JSON workspace service on loopback until the remaining hosted infrastructure is implemented.

Postgres is the intended production database. [The initial SQL schema](./packages/database/migrations/0001_initial.sql) is a design baseline; the running app currently uses the JSON development repository. Setting `DATABASE_URL` does not enable Postgres. No complete Docker/self-hosting deployment is claimed at this stage.

See [architecture and milestones](./docs/architecture.md) and the [API reference](./docs/api.md).
