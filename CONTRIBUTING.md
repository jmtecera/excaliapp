# Contributing

## Setup

Install dependencies with `pnpm install`.

Load the extension from `extension/` in `chrome://extensions` for Chrome development. For Firefox, run `pnpm package:firefox` and load `dist/build/firefox/manifest.json` from `about:debugging#/runtime/this-firefox`.

Run the Vite/Solid web app locally with:

```sh
pnpm web:dev
```

Use the deployed Supabase Edge Function for normal testing, or run `server/sync-server.js` with values from `.env.example` when you need a local sync wrapper.

## Checks

Run this before opening a pull request:

```sh
pnpm check
```

Package the extension with:

```sh
pnpm package
```

This creates Chrome, Firefox, and web app ZIPs in `dist/`, which is ignored by git. Use `pnpm package:chrome`, `pnpm package:firefox`, or `pnpm package:web` when you only need one target.

## Code Style

- Keep extension runtime files inside `extension/`.
- Keep the Vite/Solid no-extension web app inside `apps/web/`.
- Keep browser-specific manifest differences in `scripts/package-extensions.mjs`.
- Keep popup behavior compact; full setup and management belongs in Options.
- Do not add dependencies unless they remove clear complexity.
- Do not commit secrets, `.env`, packaged ZIP files, or local tool config.
- Keep Supabase service-role keys server-side only.

## Security Notes

The public sync endpoint URL is not the secret. The `EXM2-...` session code is sensitive because it grants access to a workspace's synced board list and Excalidraw room links.

When changing sync behavior, preserve these expectations:

- Extension clients never receive the Supabase service-role key.
- Direct table access remains blocked by RLS.
- Session codes remain unguessable enough for permanent sharing.
