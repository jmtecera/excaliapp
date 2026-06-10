# Excaliapp Rooms

A minimal shared room manager for Excalidraw boards. The frontend is Solid, Vite, Tailwind, and shadcn-style UI primitives. Room state is stored in Supabase Postgres and synchronized through server-only Vercel functions.

## Local development

1. Copy `.env.example` to `.env`.
2. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `POSTGRES_URL_NON_POOLING` in `.env`.
3. Run `pnpm db:push` to apply the database migrations.
4. Run `pnpm dev:api` and `pnpm dev` in separate terminals.

Vite proxies `/api` to the local API server on port `8787`.

## Vercel

Set these server-side environment variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (recommended) or `SUPABASE_SERVICE_ROLE_KEY`

The database schema is deployed separately from Vercel. Before using the production app, pull the Vercel development environment or set `POSTGRES_URL_NON_POOLING` locally and run:

```sh
pnpm db:push
```

For a linked Vercel project, the production variables can be used without writing them to disk:

```sh
pnpm dlx vercel@latest env run -e production -- pnpm db:push
```

`POSTGRES_URL_NON_POOLING` is needed only while applying migrations; the running Vercel API uses `SUPABASE_URL` and its server secret.

Do not prefix database URLs, secret keys, or service-role keys with `VITE_`; those values must never be included in the browser bundle. Realtime uses only `VITE_PUBLIC_SUPABASE_URL` and the Supabase publishable key. `VITE_API_BASE_URL` is optional and should normally remain empty so it uses the same-origin Vercel functions.

Production Vercel builds run pending migrations automatically when one of the supported Postgres URLs is configured.

## Missing RPC or schema cache

If Supabase reports that it cannot find `public.create_excalidraw_room(payload)`, the migration has not been applied to that project. Run `pnpm db:push`. The final migration also asks PostgREST to reload its schema cache.
