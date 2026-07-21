# cueBreaker — frontend

React + Vite + TypeScript SPA for cueBreaker (FLAC+CUE album splitter). Built to static
assets and embedded into the Go backend in production; served on `/` with the API under
`/api/*`. This repo is the SPA alone: it talks to the backend purely over HTTP, with no
shared code and no shared filesystem. The backend lives in a separate repository, and the
image bundling the two is assembled in the cueBreaker deployment repo.

## Layout

- `src/api/` — typed API client (`client.ts`) + domain types (`types.ts`).
- `src/tree/` — flat scan paths → library tree (`buildTree.ts`).
- `src/waveform/` — cut-line geometry (`geometry.ts`): INDEX + total duration → percent
  positions, plus the `MM:SS` timecode formatter.
- `src/split/` — `usePoll.ts` split-status polling hook. Polls via a self-rescheduling
  `setTimeout` chain (never `setInterval`), so an incremental log cursor can't overlap requests.
  Accumulates each `status()` response's `log` into one growing array; the cursor is a plain
  closure variable inside the polling effect — not state, not a ref — so a new log line never
  restarts the effect, and it resets to `0` automatically whenever the effect re-runs on a
  `jobId`/`runToken` change, in step with the reducer's `reset`.
- `src/ui/` — `resizer.ts` sidebar drag logic; `useIsMobile.ts` (mirrors the 900px CSS breakpoint);
  `useStickyScroll.ts` keeps a scrollable list pinned to the bottom while the user hasn't
  scrolled away (a `stuck` ref driven by a `scroll` listener, applied in a `useLayoutEffect`
  keyed on `deps` — not a "measure before update" snapshot, which hooks can't express). It
  re-arms whenever the ref points at a new element: collapsing a log unmounts its scroller
  while the `stuck` ref outlives it, so a log the user had scrolled up in would otherwise
  reopen showing its oldest entries.
- `src/components/` — Shell (topbar + resizable sidebar + panel), Tree, Sidebar, Topbar,
  AlbumPanel, CueSelector, TrackTable, Waveform, SplitAction, States, `LogPanel` (shared
  presentational log list — collapsible header button + timestamped, level-colored entries;
  used for both the split log in `AlbumPanel` and the scan log in `Sidebar`). `icons.tsx` holds
  the icons used by more than one component; single-use icons stay co-located with their caller.
- `src/styles/` — design tokens + per-area CSS. Dark theme only.
- `src/setupTests.ts` — jsdom gap-fillers loaded before every suite (see Conventions).
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
- `setupTests.ts` patches three jsdom gaps that tests otherwise trip over: Testing Library's
  `cleanup` is registered by hand (vitest runs without `globals: true`, so auto-cleanup never
  fires), `window.localStorage` is polyfilled (Node 22's global shadows jsdom's), and
  `matchMedia` is replaced with a stub that actually evaluates `(max-width: Npx)` and re-emits
  on resize — drive the viewport in a test by setting `window.innerWidth` and firing `resize`.
- **The waveform is decorative and stays that way** — decided during planning, not an
  oversight to fix. The `BAR_COUNT` (72) `.wbar` heights per layer come from `barHeights()`
  in `waveform/geometry.ts` — a fixed-seed LCG, not `Math.random()`, so they are stable
  across renders and tests — and are emitted as the CSS classes `h1`..`h10`, which is all
  the stylesheet decides. They are identical for every album; the backend exposes only
  `start_seconds` + `total_seconds`, never peaks, and we do not intend to add peak
  extraction. What _is_ real is the cut lines, derived from the CUE
  `INDEX` values. The `.wtime` timecode row exists to keep that honest: it gives the cuts a
  visible time axis so they read as measured against the track times rather than implying the
  bars behind them are audio analysis. Do not remove `.wtime`, and do not treat the flat bars
  as a bug.
- **The mobile drawer is off-canvas but still mounted**, so `inert` + `aria-hidden` (driven
  by `useIsMobile`, never applied on desktop) is what keeps its search box and album rows out
  of the tab order — CSS cannot express that, which is the only reason JS knows the 900px
  breakpoint at all. Focus management (open → the drawer's first control, user-close → the
  burger) keys on the open/close _transition_, never on the current state: `isMobile` is also
  an effect dep, so a viewport flip with the drawer open would otherwise re-steal focus. The
  resizer is keyboard-operable (arrows ±16px, Shift ±64px, Home/End) and carries
  `role="separator"` + `aria-valuenow/min/max`. All of this has tests in `Shell.test.tsx`.
- **Split state stays in `AlbumPanel`** — lifting `usePoll` would restart polling on unrelated
  re-renders and break its `runToken` restart semantics. Only the slice the topbar dot and
  tree progress need is lifted, as an `ActiveJob` summary via `onActiveJobChange`; `App` is
  the only path upward because the panel reaches `Shell` as opaque `children`. The preview
  refetch keys on `[item.path, cueFile, refreshToken, doneToken]` — the two counters exist for
  the disk changes the first two deps cannot see (a rescan, and a finished split). `onJobDone`
  is deliberately separate from `onActiveJobChange`, whose summary also nulls on album switch;
  keying a rescan off that would re-scan on every click. Because `jobRun` outlives an album
  switch, returning to a split album restores its job id and re-polls the same `done` — the
  `signalledRun` latch is what stops that replaying the rescan. The same latch also guards a
  **fresh page load**: a one-shot mount effect restores the deterministic `path/cue_file` job id
  from `GET /api/status/...` (404 ignored silently), reading a `jobRun` ref rather than the
  closed-over state so a slow restore can't clobber a run the user started meanwhile. That
  guard compares the ref's _key_ against the album being restored, not merely "is any job
  set?" — `jobRun` outlives an album switch, so a bare null-check would discard every later
  album's restore once one split had run in the session. When the
  restored job is already terminal, the effect pre-arms `signalledRun.current` to
  `` `${runToken}:${jobId}` `` _before_ calling `setJobRun`, so mounting a already-`done` job
  never re-fires `onJobDone`; a restored active job signals normally when it completes. Its log
  (and the live split's log) render via the shared `LogPanel`, fed by `usePoll`'s accumulated
  `log`, auto-expanding on `status === 'error'` unless the user has manually toggled it for that
  run — the toggle latch resets on a new `runToken` or album/CUE change, and the panel collapses
  with it so one album's auto-expanded failure log does not follow the user to the next. The
  accumulated log is gated on `jobId` exactly as `job` is: `usePoll` resets in an effect, so
  without the guard an album switch would paint the previous album's entries for one frame.
- **The sidebar is exactly `--sidebar-w` wide, and the tree must never be able to widen it.**
  A flex item's automatic minimum size is its min-content width, and `min-width` beats
  `width` — so a single long album name (real libraries have 90-character ones) used to
  blow `.side` out past `.sidewrap` and paint the album panel's waveform over the tree.
  Three things hold the line and all three are load-bearing: `min-width: 0` on `.sidewrap`
  and `.side`, `overflow-x: hidden` on `.tree`, and `overflow: hidden` + `text-overflow:
  ellipsis` + `white-space: nowrap` on **both** `.taname` and `.tfname` (folder names are
  often the longest label in the tree). The truncation is visual only — `Tree.tsx` puts the
  full name on each row's `title`, which is the only way it stays reachable, and
  `Tree.test.tsx` pins that. jsdom has no layout engine, so the title is the only part of
  this a unit test can catch; re-check the widths in a real browser after touching the
  sidebar CSS.
- **Album rows are `<a href>`, and the URL is what addresses an album** — so a row can be
  opened in a new tab and an album can be linked to. There is still no router: the address is
  a single `?album=<path>` query parameter (`tree/albumUrl.ts`), chosen over a path segment
  because it cannot collide with a real asset and needs no SPA fallback. `App` keeps
  `selectedPath` mirroring the URL and resolves the `ScanPair` from it once the scan lands, so
  a deep link opens as soon as the items arrive; selecting pushes a history entry and
  `popstate` drives it back. `AlbumRow`'s click handler bails out on any modifier or non-left
  button, leaving the browser's own new-tab gestures alone, and keeps its `onKeyDown` because
  links activate on Enter but not on Space. In jsdom one location is shared by a whole test
  file — `App.test.tsx` resets it in `afterEach`, or later tests mount deep-linked.
- **ESLint** (flat config, typescript-eslint) + **Prettier** (`eslint-config-prettier` last,
  so Prettier owns formatting): no semicolons, single quotes, 100-col. Run `npm run format`
  before committing; CI runs `lint` + `format:check` + `typecheck`.
- Keep the module building/testing green (`npm run build` + `npm run test`) before moving on.
- The `/api` proxy target is `BACKEND_URL` (never hardcode the backend host).

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`.
