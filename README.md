# Excaliapp Rooms

A minimal shared room manager for Excalidraw boards. The frontend is Solid, Vite, Tailwind, and shadcn-style UI primitives. Room state is stored in Supabase Postgres and synchronized through server-only Vercel functions.

## Local development

1. Copy `.env.example` to `.env`.
2. Apply `supabase/migrations/20260609000000_shared_board_rooms.sql` to your Supabase project.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
4. Run `pnpm dev:api` and `pnpm dev` in separate terminals.

Vite proxies `/api` to the local API server on port `8787`.

## Vercel

Set these server-side environment variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not prefix the service-role key with `VITE_`; it must never be included in the browser bundle. `VITE_API_BASE_URL` is optional and should normally remain empty so the frontend uses the same-origin Vercel functions.
