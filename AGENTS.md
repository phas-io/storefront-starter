# Instructions for coding agents

This repository is a minimal custom storefront for a Phasio store (Next.js, App Router).

Before you change code that calls the Phasio Auth API or the Phasio Customer API, read `skills/phasio-storefront/SKILL.md`. It contains the setup procedure, the API rules that cause most defects, and a diagnosis table. The API reference is in `skills/phasio-storefront/references/`. Do not guess endpoint paths or field names.

## Rules

- The storefront credentials (`AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`) are server-only. Do not expose them to the browser, print them, or commit them.
- Do not ask the user to paste the client secret into the conversation. The user puts it in `.env.local`.
- All calls to the two APIs go through the server (`src/lib/auth-api.ts`, `src/lib/customer-api.ts`).
- Access tokens stay in `HttpOnly` cookies (`src/lib/session.ts`).

## Commands

```bash
npm install
npm run dev         # start the development server
npm run typecheck   # type check
npm run build       # production build
```

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
