import { useCallback, useEffect, useState } from 'react'
import * as api from './api/client'
import type { ActiveJob, ScanPair } from './api/types'
import AlbumPanel from './components/AlbumPanel'
import Shell from './components/Shell'
import { EmptyScan, ScanError, ScanningLibrary } from './components/States'
import { albumHref, readAlbumPath } from './tree/albumUrl'
import { documentTitle } from './ui/title'
import './styles/shell.css'
import './styles/states.css'

export default function App() {
  const [items, setItems] = useState<ScanPair[]>([])
  const [selected, setSelected] = useState<ScanPair | null>(null)
  // The address of the open album, mirroring the URL — which is what makes the
  // tree's rows shareable links. `selected` is still the pair the panel renders;
  // it is resolved from this path once the scan has landed.
  const [selectedPath, setSelectedPath] = useState<string | null>(() =>
    readAlbumPath(window.location.search)
  )
  const [version, setVersion] = useState('')
  const [shntoolVersion, setShntoolVersion] = useState('')
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
      .then((v) => {
        setVersion(v.version)
        setShntoolVersion(v.shntool_version ?? '')
      })
      .catch(() => {
        setVersion('')
        setShntoolVersion('')
      })
  }, [rescan])

  // Back/forward — and a deep link landing on a `?album=` URL — move the
  // selection through the address, not through the tree.
  useEffect(() => {
    function syncFromUrl() {
      setSelectedPath(readAlbumPath(window.location.search))
    }
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  // Resolves the addressed album against the scan, so a deep link opens as soon
  // as the items land. An unchanged path keeps the current pair untouched —
  // that is what leaves the rescan/refresh reconciliation above in charge of it.
  useEffect(() => {
    setSelected((current) => {
      if (selectedPath === null) return null
      if (current?.path === selectedPath) return current
      return items.find((pair) => pair.path === selectedPath) ?? null
    })
  }, [selectedPath, items])

  // Keyed on the addressed path rather than on `selected`, so a tab restored
  // onto a deep link is named before the scan that resolves it has landed.
  useEffect(() => {
    document.title = documentTitle(selectedPath)
  }, [selectedPath])

  // Selecting an album is a navigation: it pushes a history entry, so Back
  // returns to the previously open album.
  const selectAlbum = useCallback((item: ScanPair) => {
    setSelected(item)
    setSelectedPath(item.path)
    window.history.pushState(null, '', albumHref(item.path))
  }, [])

  let content
  if (scanning && selected === null) {
    // Gated on `selected`, so the spinner only ever covers the initial load and a
    // rescan with nothing open. A rescan *with* an album open must leave the panel
    // mounted: unmounting it discards `jobRun`/`runToken` and stops `usePoll`, so a
    // split running behind a mid-split Rescan would never be polled again — no
    // progress, no `onJobDone`, and the Split button back to idle while the backend
    // works on. It is also what makes `refreshToken` reach a live panel at all;
    // remounting would refetch anyway and the prop would be dead code.
    content = <ScanningLibrary />
  } else if (selected) {
    // A scan error with an album open is reported *above* the panel, never in place
    // of it. Replacing it would unmount AlbumPanel — discarding `jobRun`/`runToken`
    // and stopping `usePoll` — so a failed Rescan during a split would strand the
    // job: no progress, no `onJobDone`, and a Split button back to idle that only
    // answers 409 while the backend works on. The banner surfaces the failure and
    // carries the same Retry, which is all the standing state was ever for.
    content = (
      <>
        {scanError && <ScanError message={scanError} onRetry={rescan} banner />}
        <AlbumPanel
          item={selected}
          refreshToken={refreshToken}
          onActiveJobChange={setActiveJob}
          onJobDone={refreshItems}
        />
      </>
    )
  } else if (scanError) {
    content = <ScanError message={scanError} onRetry={rescan} />
  } else if (items.length === 0) {
    content = <EmptyScan onRescan={rescan} />
  } else {
    content = <p>Select an album from the library.</p>
  }

  return (
    <Shell
      items={items}
      selectedPath={selected?.path ?? null}
      onSelect={selectAlbum}
      onRescan={rescan}
      scanning={scanning}
      version={version}
      shntoolVersion={shntoolVersion}
      activeJob={activeJob}
    >
      {content}
    </Shell>
  )
}
