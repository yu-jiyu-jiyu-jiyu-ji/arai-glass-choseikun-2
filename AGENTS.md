<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Install with `npm ci`. If `.env.local` is missing, copy `.env.example`. Leave `CHOSEIKUN_USE_MOCK` unset or `true`; Google and Firebase credentials are not required for mock development.
- Dev server: `npm run dev -- --hostname 0.0.0.0 --port 3000`.
- Under Cloud Agents, Next.js 16 defaults `experimental.agentUpgrade` to `security`. The first `next dev` or `next build` in a five-minute window exits after printing a security advisory. Run the same command again immediately. The retry keeps the dev server running or finishes the build. `npm run lint` already fails on `react-hooks/set-state-in-effect` in `app/admin/bookings/page.tsx`, `app/admin/links/page.tsx`, and `app/admin/workers/page.tsx`.
- Prove the app with a street-level address such as `東京都台東区寿3-9-6`: `POST /api/slots`, confirm a booking on `/`, then see it on `/admin/bookings`. A city-only address is rejected. `data/workers.json`, `data/booking-links.json`, and `data/bookings.json` are created on first use and gitignored.
