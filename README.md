# cueBreaker — frontend

The React + Vite + TypeScript single-page app for
[cueBreaker](https://git.horn/cueBreaker), a "Waveform & Cuts" tool for splitting
single-file FLAC albums using CUE sheets.

This repo is **the SPA only**. In production it is built to static assets and embedded
into the Go backend ([`cueBreaker/backend`](https://git.horn/cueBreaker/backend)),
which serves it on `/` with the API under `/api/*`. The combined image and the local
dev environment are assembled by the workspace repo
([`cueBreaker/workspace`](https://git.horn/cueBreaker/workspace)) — the same three-repo
pattern used across the sibling `beetDeck` / `AlbFetcharr` products.

## Stack

- **React 19** + **TypeScript**, bundled by **Vite**
- **Vitest** + **Testing Library** (jsdom) for non-visual logic
- **ESLint** (flat config, typescript-eslint) + **Prettier**

## Layout

```
src/
  api/        typed API client + domain types (client.ts, types.ts)
  tree/       flat-paths → library hierarchy builder
  waveform/   cut-line geometry (INDEX + duration → percent positions) + MM:SS formatting
  split/      split-status polling hook (usePoll)
  ui/         sidebar resizer, useIsMobile (mirrors the 900px CSS breakpoint)
  components/ Shell, Tree, Sidebar, Topbar, AlbumPanel, Waveform, ...
  styles/     design tokens + per-area CSS
```

Tests are co-located as `*.test.ts` / `*.test.tsx`, with jsdom gap-fillers (cleanup,
`localStorage`, `matchMedia`) in `src/setupTests.ts`. Visual/CSS work is verified by
`npm run build` + manual QA against the design prototype (kept in the workspace repo).

The waveform itself is **decorative** by design — the bars are CSS, not audio peaks. The cut
lines drawn over them are real, derived from the CUE `INDEX` times, and the timecode row under
the waveform gives them a visible axis. See `AGENTS.md` for the reasoning.

## Development

```bash
npm ci
npm run dev            # Vite dev server on :5173, proxies /api → $BACKEND_URL (default :5000)
npm run build          # tsc -b + vite build → dist/
npm run test           # vitest run
npm run test:cov       # vitest run --coverage
npm run lint           # eslint .
npm run format         # prettier --write .
npm run typecheck      # tsc -b --noEmit
```

The dev server proxies `/api` to the backend. Point it at a running backend with
`BACKEND_URL` (the DWE workspace sets `BACKEND_URL=http://backend:5000`); it defaults
to `http://localhost:5000`.

## Full stack

To run the frontend against the backend with hot reload, use the workspace repo:

```bash
git clone ssh://git@git.horn:2222/cueBreaker/workspace.git
cd workspace && dwe deploy run
```
