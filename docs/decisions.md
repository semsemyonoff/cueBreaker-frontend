# Decisions

Choices that shaped this SPA and are recoverable from neither the code nor the tests. Everything
else that carries a reason carries it as a comment beside the code it explains.

## The waveform is decorative

Decided during planning, not an oversight to fix. The `BAR_COUNT` (72) `.wbar` heights per layer
come from `barHeights()` in `src/waveform/geometry.ts` — a fixed-seed LCG rather than
`Math.random()`, so they stay stable across renders and tests — and are emitted as the CSS classes
`h1`..`h10`, which is all the stylesheet decides. They are identical for every album: the API
carries a `start_seconds` per track and a `total_seconds` per album, never peaks, and we do not
intend to add peak extraction.

What _is_ real is the cut lines, derived from the CUE `INDEX` values. The `.wtime` timecode row
exists to keep that honest: it gives the cuts a visible time axis, so they read as measured against
the track times rather than implying the bars behind them are audio analysis.

That row is rendered in the `idle` waveform variant only (`AlbumPanel.tsx`), as the approved design
prototype — which is not part of this repository — specifies: a running split replaces it with
the live status row, and a split album shows neither. `AlbumPanel.test.tsx` pins both its content
in the idle state and its absence once `split_done`. Keep that gate, and do not treat the flat
bars as a bug.

## No router: the URL is a `?album=` query parameter

Album rows are `<a href>` so a row can be opened in a new tab and an album can be linked to — but
addressing one album needs no router. The address is a single `?album=<path>` query parameter
(`src/tree/albumUrl.ts`); `App` mirrors it into `selectedPath`, resolves the `ScanPair` from it once
the scan lands, pushes a history entry on select, and lets `popstate` drive Back.

A query parameter rather than a path segment: an album path cannot collide with a real asset
(`/logo.svg`), nothing serving the built bundle needs an SPA fallback rewrite, and the address
survives whatever base path the app is served under.
