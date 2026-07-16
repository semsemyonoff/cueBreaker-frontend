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
