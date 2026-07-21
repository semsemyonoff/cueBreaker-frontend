# cueBreaker — frontend

The React + Vite + TypeScript single-page app for **cueBreaker**, a "Waveform & Cuts"
tool for splitting single-file FLAC albums using CUE sheets.

This repo is **the SPA only**. It talks to the cueBreaker backend purely over HTTP
(`/api/*`) — no shared code, no shared filesystem. In production it is built to static
assets and embedded into the Go backend binary, which serves it on `/`; that combined
image is assembled in the cueBreaker deployment repository.

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
  ui/         sidebar resizer, useIsMobile (mirrors the 900px CSS breakpoint),
              useStickyScroll (pins a log list to its newest line)
  components/ Shell, Tree, Sidebar, Topbar, AlbumPanel, Waveform, LogPanel, ...
  styles/     design tokens + per-area CSS
```

Tests are co-located as `*.test.ts` / `*.test.tsx`, with jsdom gap-fillers (cleanup,
`localStorage`, `matchMedia`) in `src/setupTests.ts`. Visual/CSS work is verified by
`npm run build` + manual QA against the design prototype.

The waveform itself is **decorative** by design — the bars are synthetic, not audio peaks. The
cut lines drawn over them are real, derived from the CUE `INDEX` times, and the timecode row
under the waveform gives them a visible axis. See `AGENTS.md` for the reasoning.

## Keyboard & accessibility

The sidebar resizer is keyboard-operable: arrow keys move it 16px (64px with Shift), `Home`
and `End` jump to the minimum and maximum width. On mobile, `Escape` closes the library
drawer and focus returns to the burger; the closed drawer is `inert`, so it never eats
keyboard focus from the content behind it. Library rows are reachable by Tab and activate on
`Enter`/`Space`.

While a split runs, the topbar reports it in place of the album count and the album's tree row
shows its progress. A library scan that fails says so and offers Retry, rather than rendering
as an empty library.

## Process logs

Both the album panel and the sidebar carry a collapsible log, driven by the same `LogPanel` — a
keyboard-operable `aria-expanded` disclosure button over a list of timestamped, level-coloured
lines. Both start collapsed.

- **Split log** (under the Split button) streams the pipeline as a run progresses: CUE parsed,
  source resolved, breakpoints, one line per track, tagging, cover, done. It stays pinned to the
  newest line unless you scroll up, and re-pins when you scroll back to the bottom. It expands
  itself when a split fails, unless you had already toggled it by hand for that run.
- **Scan log** (sidebar footer) lists one line per directory the walk rejected, with the reason —
  already split, source missing, not FLAC/WAV, unreadable — plus an `N albums · M skipped`
  summary. Directories holding no CUE sheet at all are never listed: they are the overwhelming
  majority of a walk and carry no signal.

Reloading the page mid-split re-attaches to the running job and its log; job ids are
deterministic (`path/cue_file`), so the panel can ask the backend for one without you touching
Split again. On mobile the log body is capped at 30vh so the tree keeps its own scroll.

Each log is a bounded tail of the backend's last 500 entries, not a complete transcript.

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

Requires Node.js 22+.

The dev server proxies `/api` to the backend. Point it at a running backend with the
`BACKEND_URL` env var; it defaults to `http://localhost:5000`.

```bash
BACKEND_URL=http://localhost:5001 npm run dev
```

## Production build

```bash
npm run build        # tsc -b && vite build → dist/
```

The output is a plain static bundle served from `/`. The release image copies it into the
backend's `web/dist/`, where it is embedded into the Go binary via `//go:embed`.

## License

MIT — see [LICENSE](LICENSE).
