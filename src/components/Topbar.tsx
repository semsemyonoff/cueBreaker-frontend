import type { Ref } from 'react'

export interface TopbarProps {
  version: string
  /** The splitter's shntool version; the badge is dropped when it is unknown. */
  shntoolVersion?: string
  albumCount: number
  unsplitCount: number
  /** Number of splits currently running; replaces the album count while non-zero (proto:264). */
  splittingCount: number
  drawerOpen: boolean
  drawerId: string
  burgerRef?: Ref<HTMLButtonElement>
  onBurgerClick: () => void
}

export default function Topbar({
  version,
  shntoolVersion = '',
  albumCount,
  unsplitCount,
  splittingCount,
  drawerOpen,
  drawerId,
  burgerRef,
  onBurgerClick,
}: TopbarProps) {
  const splitting = splittingCount > 0

  return (
    <div className="dtop">
      <button
        className="burger"
        type="button"
        ref={burgerRef}
        aria-label="Toggle library"
        aria-expanded={drawerOpen}
        aria-controls={drawerId}
        onClick={onBurgerClick}
      >
        <i />
        <i />
        <i />
      </button>
      <div className="brand">
        <img className="blogo" src="/logo.svg" alt="cueBreaker logo" />
        <div className="word">
          cue<span>Breaker</span>
        </div>
        {version && <span className="ver">v{version}</span>}
        {shntoolVersion && <span className="ver tool">shntool {shntoolVersion}</span>}
      </div>
      <div className="tstat">
        <span className={splitting ? 'dot run' : 'dot'} />
        {splitting ? (
          <span>
            <b>{splittingCount}</b> splitting
          </span>
        ) : (
          <span>
            <b>{albumCount}</b> albums
          </span>
        )}
        <span>
          <b>{unsplitCount}</b> unsplit
        </span>
      </div>
    </div>
  )
}
