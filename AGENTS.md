# cueBreaker — frontend

React + Vite + TypeScript SPA for cueBreaker (FLAC+CUE album splitter). Built to static
assets and embedded into the Go backend in production; served on `/` with the API under
`/api/*`. Part of a three-repo product (`backend`, `frontend`, `workspace`) mirroring the
sibling `beetDeck` / `AlbFetcharr` orgs.

## Layout

- `src/api/` — typed API client (`client.ts`) + domain types (`types.ts`).
- `src/tree/` — flat scan paths → library tree (`buildTree.ts`).
- `src/waveform/` — cut-line geometry (`geometry.ts`): INDEX + total duration → percent positions.
- `src/split/` — `usePoll.ts` split-status polling hook.
- `src/ui/` — `resizer.ts` sidebar drag logic.
- `src/components/` — Shell (topbar + resizable sidebar + panel), Tree, Sidebar, Topbar,
  AlbumPanel, CueSelector, TrackTable, Waveform, SplitAction, States.
- `src/styles/` — design tokens + per-area CSS. Dark theme only.
- Tests co-located as `*.test.ts(x)`.

## Commands

```bash
npm ci
npm run dev            # Vite dev server :5173, proxies /api → $BACKEND_URL (default :5000)
npm run build          # tsc -b && vite build → dist/
npm run test           # vitest run
npm run test:cov       # vitest run --coverage
npm run lint           # eslint .
npm run format         # prettier --write .   (format:check in CI)
npm run typecheck      # tsc -b --noEmit
```

## Conventions

- **Vitest** for non-visual logic (tree building, waveform geometry, API client, split
  polling). Mock `fetch`; use `@testing-library/react` for component tests. Pure-visual/CSS
  work is verified by `npm run build` + manual QA against the prototype.
- **ESLint** (flat config, typescript-eslint) + **Prettier** (`eslint-config-prettier` last,
  so Prettier owns formatting): no semicolons, single quotes, 100-col. Run `npm run format`
  before committing; CI runs `lint` + `format:check` + `typecheck`.
- Keep the module building/testing green (`npm run build` + `npm run test`) before moving on.
- The `/api` proxy target is `BACKEND_URL` (never hardcode the backend host).

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`.
