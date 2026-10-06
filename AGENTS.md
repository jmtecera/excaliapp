# AGENTS.md

## Project

Excaliapp Rooms is a SolidJS web app backed by Vercel Functions and Supabase. It manages shared Excalidraw board links, room presence, optional PIN access, and a synchronized Pomodoro timer.

## Setup

```sh
pnpm install
cp .env.example .env
pnpm db:push
```

Run the API and frontend separately:

```sh
pnpm dev:api
pnpm dev
```

Before finishing a change, run:

```sh
pnpm check
```

## Repository Map

- `src/`: SolidJS frontend and shared browser logic
- `src/components/ui/`: small local UI primitives
- `api/`: Vercel Function entry points
- `server/handlers.js`: shared HTTP handlers used by `api/` and the local server
- `server/supabase.js`: request validation, response sanitization, and Supabase RPC client
- `server/sync-server.js`: local API server used by Vite
- `supabase/migrations/`: ordered database schema and RPC migrations
- `scripts/`: migration and Vercel build helpers

## Coding Conventions

- Use TypeScript for frontend code and ESM JavaScript for server functions.
- Follow existing SolidJS signal, memo, and effect patterns.
- Keep UI components controlled through props rather than adding global state.
- Reuse the local `Button`, `Input`, `Dialog`, and `InputOTP` primitives.
- Support the dark, light, and system themes and preserve the existing neutral visual system.
- Use Tailwind utility classes for component styling and `src/styles.css` for global tokens or keyframes.
- Keep user-facing text in `src/i18n.ts` and add every string in both English and Spanish.
- Keep edits narrowly scoped and avoid unrelated formatting changes.

## Data Flow

The browser calls same-origin `/api/rooms` routes. API handlers in `server/handlers.js` pass request bodies to `server/supabase.js`, which validates and normalizes every field before invoking server-only Supabase RPCs.

Supabase RPCs are `security definer` functions available only to the service role. Database tables use row-level security and are not directly accessible to browser roles. Realtime broadcasts contain change notifications; protected room data is fetched through the API after authorization.

The room code is the access capability for an unprotected room. A protected room additionally requires a time-limited plaintext access token in browser storage; only its SHA-256 hash is stored in Postgres.

## Security Rules

- Never expose Supabase server keys or database URLs to Vite.
- Do not add server secrets to variables prefixed with `VITE_`.
- Validate new API fields in `server/supabase.js` before they reach an RPC.
- Keep API error messages generic. Do not return raw Postgres or Supabase errors.
- Do not include participant email, access tokens, PINs, secret hashes, or server configuration in logs or shared presence data. Presence may include only the MD5 identifier required by Gravatar.
- Treat Excalidraw collaboration URLs as protected room data because their fragments contain encryption keys.
- Enforce authorization in database functions for every protected read or mutation.
- Add a new migration for schema or RPC changes; do not rewrite migrations that may already be deployed.

## Database Changes

Create timestamped SQL files in `supabase/migrations/`. Revoke function execution from `public`, `anon`, and `authenticated`, then grant only the required function to `service_role`.

Apply migrations locally with:

```sh
pnpm db:push
```

## Testing

`server/supabase.test.js` covers request validation, sensitive-field filtering, and PIN throttling behavior. `server/handlers.test.js` covers HTTP routing. Add focused tests when changing API contracts. Frontend changes must pass TypeScript and a production Vite build.
