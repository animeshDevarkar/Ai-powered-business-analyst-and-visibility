# Local API reference

Base URL: `http://127.0.0.1:4000`. The dashboard uses `/api` through the Next.js proxy. Successful resource responses use `{ "data": ... }`. Errors use `{ "error": { "code": "...", "message": "..." } }`; validation responses include field details and internal errors include a request ID.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Service health, version, and local mode |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create a project (201) |
| GET | `/api/projects/:id` | Project, latest memory, history, prompts, activity, and future evidence collections |
| PUT | `/api/projects/:id/memory` | Append a memory version |
| POST | `/api/projects/:id/prompts` | Add a prompt (201) |
| DELETE | `/api/projects/:id/prompts/:promptId` | Remove a prompt from that project (204) |
| GET | `/api/projects/:id/export` | Download versioned JSON export |

## Create a project

```json
{
  "name": "Acme Studio",
  "website": "https://example.com",
  "description": "Analytics tools for small businesses"
}
```

Website URLs must use HTTP or HTTPS and are normalized to their origin. IDs and timestamps are generated on the backend.

Each website can have only one project across all accounts. The normalized hostname identifies a website: HTTP/HTTPS, leading `www`, case, a trailing hostname dot, ports, paths, and query strings do not create another website. Distinct subdomains remain separate. Attempts to register an existing website return **409** with code `WEBSITE_ALREADY_EXISTS`. The response does not identify the existing owner or reveal their project.

## Save business memory

```json
{
  "positioning": "Analytics for small teams",
  "audience": "Business owners",
  "products": ["Analytics workspace"],
  "competitors": [],
  "disallowedClaims": ["Unverified customer counts"],
  "claims": [{
    "statement": "We offer an analytics workspace",
    "sourceUrl": "https://example.com/product",
    "owner": "Project owner",
    "approvedAt": "2026-10-03T12:00:00.000Z"
  }]
}
```

## Add a prompt

```json
{
  "question": "Which analytics tools work well for small teams?",
  "intent": "comparison",
  "engine": "chatgpt",
  "locale": "en-US",
  "priority": "medium"
}
```

Intent values: `discovery`, `comparison`, `purchase`, `support`. Engine values: `chatgpt`, `perplexity`, `google_ai_mode`, `google_ai_overview`, `copilot`, `claude`. Priority values: `high`, `medium`, `low`.

The request-body limit is 256 KB. Invalid JSON and validation errors return 400, unauthenticated project requests return 401, disallowed browser origins return 403, missing resources return 404, and oversized requests return 413. Missing auth configuration returns 503 for project operations. No endpoints initiate paid jobs or publish changes.

## Authentication

- `GET /api/auth/config` returns `{ data: { ready, google } }` capability flags.
- `GET /api/me` returns the authenticated user's public profile, or 401.
- `/api/auth/*` forwards to Better Auth for email/password signup, sign-in, Google OAuth, sessions, and sign-out. These endpoints use Better Auth's response format.

Project data is scoped to the session's user ID. See [authentication setup](./authentication.md).
