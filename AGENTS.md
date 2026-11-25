<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes (ours.)

- Private two-person app. All data access goes through Supabase RLS; never add a service-role key to this app.
- Private media lives in the `media` bucket and is only shown via signed URLs (`src/lib/supabase/media.ts`).
- Never seed or invent shared memories, dates or photos.
- Checks: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:db` (needs `npm run db:start`).
