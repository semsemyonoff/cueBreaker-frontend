import type { Ref } from 'react'

export interface TopbarProps {
  version: string
  albumCount: number
  unsplitCount: number
  drawerOpen: boolean
  drawerId: string
  burgerRef?: Ref<HTMLButtonElement>
  onBurgerClick: () => void
}

export default function Topbar({
  version,
  albumCount,
  unsplitCount,
  drawerOpen,
  drawerId,
  burgerRef,
  onBurgerClick,
}: TopbarProps) {
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
      </div>
      <div className="tstat">
        <span className="dot" />
        <span>
          <b>{albumCount}</b> albums
        </span>
        <span>
          <b>{unsplitCount}</b> unsplit
        </span>
      </div>
    </div>
  )
}
