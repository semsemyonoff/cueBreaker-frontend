import { useCallback, useEffect, useState } from 'react'
import * as api from './api/client'
import type { ScanPair } from './api/types'
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

  const rescan = useCallback(() => {
    setScanning(true)
    api
      .scan()
      .then((next) => {
        setItems(next)
        setScanError(null)
      })
      .catch((err: unknown) => {
        // A failed scan must not look like a successful empty one: keep the last
        // known items and report the failure instead of silently emptying.
        setScanError(err instanceof Error ? err.message : 'library scan failed')
      })
      .finally(() => setScanning(false))
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
    content = <AlbumPanel item={selected} />
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
    >
      {content}
    </Shell>
  )
}
