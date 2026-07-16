import { ErrIcon } from './icons'

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

export interface ScanErrorProps {
  message: string
  onRetry: () => void
  /**
   * Render as a strip above other content instead of a centred standing state.
   * `App` uses it to report a failed rescan without unmounting an open panel —
   * see the render chain there.
   */
  banner?: boolean
}

export function ScanError({ message, onRetry, banner = false }: ScanErrorProps) {
  const box = (
    <div className={banner ? 'errbox scanbanner' : 'errbox scanerror'}>
      <div className="eh">
        <ErrIcon />
        Library scan failed
      </div>
      <div className="em">{message}</div>
      {banner && (
        <button className="rescan" type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )

  if (banner) return box

  return (
    <div className="emptybox">
      {box}
      <button className="rescan" type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
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
