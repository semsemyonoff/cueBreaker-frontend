import { useRef, type ReactNode } from 'react'
import type { LogEntry, LogLevel } from '../api/types'
import { useStickyScroll } from '../ui/useStickyScroll'
import '../styles/log.css'

export interface LogPanelProps {
  entries: LogEntry[]
  label: string
  /** Right-aligned text in the header, e.g. an entry count or scan summary. */
  summary?: ReactNode
  /** Owner-held so error auto-expand and a manual toggle can both drive it. */
  open: boolean
  onToggle: (open: boolean) => void
}

const ROW_CLASS: Record<LogLevel, string> = {
  info: 'll',
  warn: 'll ll-warn',
  error: 'll ll-err',
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Collapsible log list shared by the split panel and the scan sidebar footer. */
export default function LogPanel({ entries, label, summary, open, onToggle }: LogPanelProps) {
  const bodyRef = useRef<HTMLUListElement>(null)
  useStickyScroll(bodyRef, [entries.length])

  return (
    <div className="logbox">
      <button className="lh" type="button" aria-expanded={open} onClick={() => onToggle(!open)}>
        <span className="ltoggle" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {label}
        <span className="lspacer" />
        {summary !== undefined && <span className="lsum">{summary}</span>}
      </button>
      {open && (
        <ul className="lbody" ref={bodyRef}>
          {entries.length === 0 ? (
            <li className="lempty">No log entries yet</li>
          ) : (
            entries.map((entry) => (
              <li key={entry.seq} className={ROW_CLASS[entry.level]}>
                <span className="lt">{formatTime(entry.time)}</span>
                <span className="lm">{entry.text}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
