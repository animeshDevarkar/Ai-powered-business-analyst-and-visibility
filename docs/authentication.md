# Analytiq authentication

Authentication runs in the Hono API through Better Auth and its MongoDB adapter. The Next.js frontend proxies `/api/auth/*`, keeping browser requests and session cookies on the same origin. The dashboard checks the session server-side, and every project API call independently checks it again.

## Configure later

Copy the repository's `.env.example` to `apps/api/.env`. Fill in:

```dotenv
MONGODB_URI=your-mongodb-connection-string
MONGODB_DB=analytiq
BETTER_AUTH_SECRET=your-random-secret-of-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Generate the secret locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use an Atlas cluster or a replica set for transactions. For a standalone development MongoDB server, set `MONGODB_TRANSACTIONS=false`. Restart the API after changing its environment. Credentials belong in the backend environment; never add `NEXT_PUBLIC_` to these keys or commit `.env` files.

Verify the configured database from the repository root:

```sh
npm run db:check -w @visibility/api
```

The check connects, authenticates, writes and reads a uniquely tagged temporary verification record, then deletes it. It does not create an account or print the connection string.

## Google setup

Create an OAuth client of type **Web application** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Configure the consent screen and test users when using a testing app.

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

Use the same browser hostname as `BETTER_AUTH_URL` for Google sign-in. For deployment, replace localhost with the HTTPS application origin and register that callback URI in Google. The OAuth flow requests Google's standard identity information; it does not authorize Search Console or Analytics access.

## Storage and account behavior

MongoDB uses the `user`, `account`, `session`, and `verification` collections for authentication, and `project_websites` for global website reservations. Passwords are hashed by Better Auth; plaintext passwords are not stored. Sessions use HTTP-only cookies and expire after seven days. MongoDB indexes enforce unique emails, session tokens, and provider-account pairs, and expire session / verification documents. OAuth tokens are encrypted using the authentication secret.

Each signed-in account receives its own JSON workspace under `.data/workspaces/<sha256-user-id>.json`. Other users cannot list, read, modify, or export its projects. The old `.data/workspace.json` remains a legacy backup. Importing its data requires an explicit future migration rather than giving it to the first person who signs up.

The owning MongoDB `user` document also stores a `projects` array. Each entry contains `projectId`, `projectName`, `projectUrl`, and `createdAt`. Project creation writes this summary, and listing projects retries the sync if needed. Updates replace an entry by project ID without duplicating it or overwriting other projects. Business memory, prompts, and activity still live in the account's local workspace.

Backfill and verify existing account-owned project summaries with:

```sh
npm run db:sync-projects -w @visibility/api
```

The command matches each MongoDB account to its workspace using the hashed user ID. It verifies the saved names and URLs, can safely run repeatedly, and does not assign unowned legacy data to any account.

Website reservations use a normalized hostname as MongoDB's unique `_id`. Reserving the hostname precedes saving a project, so concurrent requests across accounts cannot both succeed. Existing local and legacy projects are registered when the website registry initializes. This does not assign legacy projects to an account or delete existing duplicate records. A failed local write releases its own reservation. Since MongoDB reservations and local files cannot share a transaction, a process crash between writes may leave a reservation requiring manual recovery; retaining it prevents accidental duplicates.

Automatic linking between email/password and Google accounts is disabled. If an email already belongs to an account using another sign-in method, use the original method. Verified account linking, email verification, and password recovery can be added later. Rate limits are enabled in the authentication library; their memory-backed counters are suitable for one API process and need shared storage when scaling.

## Before credentials are supplied

`/login` and `/signup` display the page and theme toggle. Authentication actions remain unavailable, and a short service message explains why. There is no demo session or fake success. The auth configuration endpoint exposes only capability booleans, never credentials. Protected project APIs fail closed.

## Verification

The API tests cover session requirements, account isolation, unavailable configuration, and existing project workflows. Full signup/login writes, live MongoDB transactions, and Google consent / callback need a real configured database and OAuth client; they cannot be verified before those credentials are supplied.

Implementation references: [MongoDB adapter](https://better-auth.com/docs/adapters/mongo), [Hono integration](https://better-auth.com/docs/integrations/hono), [Google provider](https://better-auth.com/docs/authentication/google), and [email/password authentication](https://better-auth.com/docs/authentication/email-password).
