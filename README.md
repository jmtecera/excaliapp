# Excaliapp Rooms

Excaliapp Rooms is a dark-mode web app for organizing shared Excalidraw boards. A room has a short code, a shared board list, participant presence, an optional PIN, and a synchronized Pomodoro timer.

## Stack

- SolidJS and TypeScript
- Vite and Tailwind CSS
- Vercel Functions for the HTTP API
- Supabase Postgres RPCs for room state
- Supabase Realtime for change notifications and presence

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer
- A Supabase project

## Local Setup

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Create a local environment file:

   ```sh
   cp .env.example .env
   ```

3. Configure the Supabase URL, server secret, migration database URL, and public Realtime key in `.env`.

4. Apply the database migrations:

   ```sh
   pnpm db:push
   ```

5. Start the API and frontend in separate terminals:

   ```sh
   pnpm dev:api
   pnpm dev
   ```

Vite proxies `/api` to the local API on port `8787`.

## Commands

```sh
pnpm dev          # Start the Vite development server
pnpm dev:api      # Start the local API server
pnpm test         # Run server validation and security tests
pnpm typecheck    # Check TypeScript
pnpm build        # Create a production frontend build
pnpm check        # Run tests, typecheck, and build
pnpm db:push      # Apply pending Supabase migrations
pnpm preview      # Preview the production frontend build
```

## Environment

Server-only values:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`, or the legacy `SUPABASE_SERVICE_ROLE_KEY`
- `POSTGRES_URL_NON_POOLING` for migration commands

Browser-safe values:

- `VITE_PUBLIC_SUPABASE_URL`
- `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL`, normally left empty for same-origin API requests

Never prefix database URLs or server secrets with `VITE_`.

## Access Model

Room codes are capability links. Anyone with the code can join an unprotected room and collaborate. When a PIN is enabled, room data and mutations require a valid room access token issued after PIN verification.

PIN checks, timer changes, board synchronization, and room updates are enforced in server-side Supabase functions. PIN failures are throttled per room and request source. Access tokens are stored as SHA-256 hashes in Postgres and expire after 90 days.

Excalidraw collaboration links contain the board encryption key. They are shared only with members who can access the room. Participant email addresses are kept in the browser for the local Gravatar preview and are not sent through room sync or Realtime presence.

## Deployment

The frontend and API are configured for Vercel. Set the server and public environment variables in the Vercel project, then apply migrations before serving a new release.

Production builds can apply pending migrations when a supported Postgres URL is available:

```sh
pnpm vercel-build
```
