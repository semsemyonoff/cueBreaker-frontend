# cueBreaker — frontend

React + Vite + TypeScript SPA for cueBreaker, a "Waveform & Cuts" tool for splitting single-file
FLAC albums using CUE sheets. `README.md` owns the stack, the layout, the commands and the
user-visible behaviour — read it first. This file adds only what an agent needs on top of it.

## Map

What `README.md`'s tree leaves out, or names without explaining:

- `src/tree/albumUrl.ts` — the whole URL contract: build a `?album=` href, read a path back out.
- `src/ui/title.ts` — the document title for the addressed album (`<album leaf> — cueBreaker`).
- `src/components/icons.tsx` — icons used by more than one component; a single-use icon stays
  co-located with its caller.
- `src/components/LogPanel.tsx` — one shared presentational log list, rendered by both
  `AlbumPanel` (split log) and `Sidebar` (scan log). It holds no open state; its owner does.
- `src/styles/` — dark theme only; there is no light variant to keep in step.

## Rules

- Split state stays in `AlbumPanel`. Do not lift `usePoll` — it restarts polling and breaks the
  `runToken` restart semantics that make split-again work on an unchanged job id. The `ActiveJob`
  summary emitted through `onActiveJobChange` is the only slice that goes up; `onJobDone` is
  deliberately a separate callback (see the prop's doc comment).
- Never let the tree widen the sidebar. The load-bearing declarations are commented as such in
  `styles/shell.css` — do not "tidy" them. jsdom has no layout engine, so the only unit-testable
  part is the row `title` (`Tree.test.tsx`, "carries the full album name in a title attribute");
  re-check the widths in a real browser after touching the sidebar CSS.
- `ui/useIsMobile.ts` exists only because CSS cannot drive `inert`/`aria-hidden` on the off-canvas
  drawer (`Shell.tsx`, `drawerHidden`), nor the focus moves that follow it opening and closing
  (the `wasOpen`/`isMobile` effect below it). Those two are all JS may key on the breakpoint for.
- Album rows are real `<a href>` — `Tree.tsx` bails out of its click handler on any modifier or
  non-left button, leaving new-tab gestures to the browser (`Tree.test.tsx`, "leaves the browser
  to handle new-tab and new-window gestures"). jsdom shares one location per test file, so
  `App.test.tsx` resets it in `afterEach`.
- Drive the viewport in a test by setting `window.innerWidth` and firing a `resize` event —
  `setupTests.ts` stubs `matchMedia` to evaluate `(max-width: Npx)` and re-emit on resize.
- `Shell.test.tsx` does **not** pin the drawer's focus transition guard: it covers focus-on-open
  and focus-back-to-burger, but nothing fires a `resize` with the drawer open, so deleting the
  `wasOpen`/`isMobile` guard in `Shell.tsx` still goes green. Verify that one by hand.
- `.wtime` is rendered only in the `idle` waveform variant (`AlbumPanel.tsx`) — keep that gate;
  `AlbumPanel.test.tsx` pins both its content and its absence after a split ("drops the timecode
  row once the album is split (idle-state only, per the prototype)").
- Prettier owns formatting (`eslint-config-prettier` last in the flat config): run `npm run format`
  before committing. `.github/workflows/ci.yml` is the real list of what CI gates.
- Keep `npm run build` and `npm run test` green before moving on.
- Both dev-server knobs in `vite.config.ts` come from the environment and are never hardcoded:
  `BACKEND_URL` (the origin `/api` is proxied to) and `DEV_ALLOWED_HOSTS` (comma-separated extra
  Host headers the dev server will answer to, when reached by a name other than `localhost`).

## Where the why lives

Read the source comment before changing any of these; each explains a bug it prevents.

- `components/AlbumPanel.tsx` — job identity, restore-on-reload, the `signalledRun` latch, log
  gating.
- `split/usePoll.ts` — the `setTimeout` chain, the closure cursor, what `runToken` restarts.
- `ui/useStickyScroll.ts` — why the pin re-arms when the ref points at a new element.
- `styles/shell.css` — the declarations holding the sidebar at `--sidebar-w`.
- `setupTests.ts` — the three jsdom gaps it fills and why each is needed.
- `tree/albumUrl.ts` — query parameter vs path segment, and the encoding it implies.
- `docs/decisions.md` (at the repo root, not under `src/`) — the decisions that live in neither
  code nor tests.

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`.
