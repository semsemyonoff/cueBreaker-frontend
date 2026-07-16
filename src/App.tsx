import { useCallback, useEffect, useState } from 'react'
import * as api from './api/client'
import type { ActiveJob, ScanPair } from './api/types'
import AlbumPanel from './components/AlbumPanel'
import Shell from './components/Shell'
import { EmptyScan, ScanError, ScanningLibrary } from './components/States'
import './styles/shell.css'
import './styles/states.css'

export default function App() {
  const [items, setItems] = useState<ScanPair[]>([])
  const [selected, setSelected] = useState<ScanPair | null>(null)
  const [version, setVersion] = useState('')
  const [scanning, setScanning] = useState(true)
  const [scanError, setScanError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  // AlbumPanel owns the polling; App is the only path from it to Shell, since the
  // panel is passed to Shell as opaque children.
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)

  const rescan = useCallback(() => {
    setScanning(true)
    api
      .scan()
      .then((next) => {
        setItems(next)
        setScanError(null)
        // The open panel reads `cue_files` off its ScanPair, so a rescan has to
        // hand it the fresh object — and drop the selection when the album is gone,
        // rather than render a panel for an album that no longer exists.
        setSelected((current) =>
          current === null ? null : (next.find((pair) => pair.path === current.path) ?? null)
        )
        // A rescan also means disk state may have moved under the panel's preview.
        setRefreshToken((n) => n + 1)
      })
      .catch((err: unknown) => {
        // A failed scan must not look like a successful empty one: keep the last
        // known items and report the failure instead of silently emptying.
        setScanError(err instanceof Error ? err.message : 'library scan failed')
      })
      .finally(() => setScanning(false))
  }, [])

  // A job completing changes `items` — the album has just gained its split output —
  // with no user action behind it. Refreshing them quietly (no `scanning` state, so
  // no spinner unmounts the open panel; no `scanError`, so a hiccup here cannot tear
  // down a panel that has just finished a split) keeps the topbar counters and the
  // tree's ✓ honest. The panel's own `preview` is refreshed separately, by its
  // `doneToken`.
  const refreshItems = useCallback(() => {
    api
      .scan()
      .then((next) => {
        setItems(next)
        // Keep the current object when the album survives the scan but is somehow
        // absent from it: dropping the selection out from under a finished split
        // would be worse than briefly stale `cue_files`.
        setSelected((current) =>
          current === null ? null : (next.find((pair) => pair.path === current.path) ?? current)
        )
      })
      .catch(() => {
        // Best-effort: the counters stay stale, exactly as they would have without
        // this refresh. Rescan remains the user's escape hatch.
      })
  }, [])

  useEffect(() => {
    rescan()
    api
      .version()
      .then((v) => setVersion(v.version))
      .catch(() => setVersion(''))
  }, [rescan])

  let content
  if (scanning) {
    content = <ScanningLibrary />
  } else if (scanError) {
    // Must precede `selected`: a failed rescan with an album open would otherwise
    // render AlbumPanel and the error would never surface.
    content = <ScanError message={scanError} onRetry={rescan} />
  } else if (selected) {
    content = (
      <AlbumPanel
        item={selected}
        refreshToken={refreshToken}
        onActiveJobChange={setActiveJob}
        onJobDone={refreshItems}
      />
    )
  } else if (items.length === 0) {
    content = <EmptyScan onRescan={rescan} />
  } else {
    content = <p>Select an album from the library.</p>
  }

  return (
    <Shell
      items={items}
      selectedPath={selected?.path ?? null}
      onSelect={setSelected}
      onRescan={rescan}
      version={version}
      activeJob={activeJob}
    >
      {content}
    </Shell>
  )
}
