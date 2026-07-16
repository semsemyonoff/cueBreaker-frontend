const SCANBAR_COUNT = 7

export function EmptyScan({ onRescan }: { onRescan: () => void }) {
  return (
    <div className="emptybox">
      <div className="flatline" />
      <div className="et">No unsplit CUE + FLAC albums found</div>
      <button className="rescan" type="button" onClick={onRescan}>
        Rescan library
      </button>
    </div>
  )
}

export function ScanError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="emptybox">
      <div className="errbox scanerror">
        <div className="eh">
          <ErrIcon />
          Library scan failed
        </div>
        <div className="em">{message}</div>
      </div>
      <button className="rescan" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

function ErrIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f36a6f" strokeWidth="2.4">
      <path d="M12 8v5M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

export function ScanningLibrary() {
  return (
    <div className="emptybox">
      <div className="scanbars">
        {Array.from({ length: SCANBAR_COUNT }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="et">Scanning library…</div>
    </div>
  )
}
