import { useMemo, useState } from 'react'
import type { ActiveJob, LogEntry, ScanPair, ScanSummary } from '../api/types'
import { buildTree, filterTree } from '../tree/buildTree'
import LogPanel from './LogPanel'
import Tree from './Tree'

export interface SidebarProps {
  items: ScanPair[]
  selectedPath: string | null
  onSelect: (item: ScanPair) => void
  onRescan: () => void
  /** A scan is in flight — the button spins and stops accepting clicks. */
  scanning?: boolean
  activeJob?: ActiveJob | null
  scanLog?: LogEntry[]
  scanSummary?: ScanSummary | null
}

export default function Sidebar({
  items,
  selectedPath,
  onSelect,
  onRescan,
  scanning = false,
  activeJob = null,
  scanLog = [],
  scanSummary = null,
}: SidebarProps) {
  const [query, setQuery] = useState('')
  const [logOpen, setLogOpen] = useState(false)

  const tree = useMemo(() => filterTree(buildTree(items), query), [items, query])

  return (
    <div className="side">
      <div className="sidetop">
        <input
          className="search"
          placeholder="Search library…"
          aria-label="Search library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="rescan"
          type="button"
          onClick={onRescan}
          disabled={scanning}
          aria-busy={scanning || undefined}
        >
          {scanning && <span className="rescanspin" aria-hidden="true" />}
          Rescan
        </button>
      </div>
      <Tree nodes={tree} selectedPath={selectedPath} onSelect={onSelect} activeJob={activeJob} />
      <LogPanel
        entries={scanLog}
        label="Scan log"
        summary={
          scanSummary
            ? `${scanSummary.albums} album${scanSummary.albums === 1 ? '' : 's'} · ${scanSummary.skipped} skipped`
            : undefined
        }
        open={logOpen}
        onToggle={setLogOpen}
      />
    </div>
  )
}
