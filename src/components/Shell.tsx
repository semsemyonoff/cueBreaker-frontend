import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { ScanPair } from '../api/types'
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  clampWidth,
  loadWidth,
  saveWidth,
} from '../ui/resizer'
import { useIsMobile } from '../ui/useIsMobile'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const DRAWER_ID = 'library-drawer'
/** Width in px one arrow key press moves the resizer; Shift multiplies it. */
const RESIZE_STEP = 16
const RESIZE_STEP_LARGE = 64

export interface ShellProps {
  items: ScanPair[]
  selectedPath: string | null
  onSelect: (item: ScanPair) => void
  onRescan: () => void
  version: string
  children?: ReactNode
}

export default function Shell({
  items,
  selectedPath,
  onSelect,
  onRescan,
  version,
  children,
}: ShellProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() => loadWidth())
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Holds the pointerup/pointermove teardown for the drag currently in
  // progress (if any), so unmounting mid-drag removes the exact listeners
  // that were added rather than a stale closure from an earlier render.
  const dragCleanup = useRef<(() => void) | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  // Tracks the previous open state so focus returns to the burger only after a
  // close the user performed, not on the initial (already-closed) render.
  const wasOpen = useRef(false)

  const isMobile = useIsMobile()
  // Off-canvas but still rendered: without `inert` the search box and every album
  // row stay tabbable and screen-reader reachable while translated off-screen.
  // Never on desktop, where the same markup is the visible sidebar.
  const drawerHidden = isMobile && !drawerOpen

  const albumCount = items.length
  const unsplitCount = items.filter((item) => !item.split_done).length

  function closeDrawer() {
    setDrawerOpen(false)
  }

  function selectAndClose(item: ScanPair) {
    onSelect(item)
    closeDrawer()
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth

    function handlePointerMove(moveEvent: PointerEvent) {
      setSidebarWidth(clampWidth(startWidth + (moveEvent.clientX - startX)))
    }

    function stopResize() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      dragCleanup.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    dragCleanup.current = stopResize
  }

  function resizeOnKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP
    const next: Record<string, (width: number) => number> = {
      ArrowLeft: (width) => width - step,
      ArrowRight: (width) => width + step,
      Home: () => MIN_SIDEBAR_WIDTH,
      End: () => MAX_SIDEBAR_WIDTH,
    }
    const move = next[event.key]
    if (!move) return

    event.preventDefault()
    setSidebarWidth((width) => clampWidth(move(width)))
  }

  useEffect(() => {
    saveWidth(sidebarWidth)
  }, [sidebarWidth])

  useEffect(() => {
    return () => dragCleanup.current?.()
  }, [])

  useEffect(() => {
    if (!drawerOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen])

  useEffect(() => {
    const closedByUser = wasOpen.current && !drawerOpen
    wasOpen.current = drawerOpen
    if (!isMobile) return

    if (drawerOpen) {
      drawerRef.current?.querySelector<HTMLElement>('input, button, [tabindex="0"]')?.focus()
    } else if (closedByUser) {
      burgerRef.current?.focus()
    }
  }, [drawerOpen, isMobile])

  return (
    <div className="shell">
      <Topbar
        version={version}
        albumCount={albumCount}
        unsplitCount={unsplitCount}
        drawerOpen={drawerOpen}
        drawerId={DRAWER_ID}
        burgerRef={burgerRef}
        onBurgerClick={() => setDrawerOpen((open) => !open)}
      />
      <div className="dbody">
        <div
          id={DRAWER_ID}
          ref={drawerRef}
          className={drawerOpen ? 'sidewrap drawer-open' : 'sidewrap'}
          inert={drawerHidden}
          aria-hidden={drawerHidden || undefined}
          style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
        >
          <Sidebar
            items={items}
            selectedPath={selectedPath}
            onSelect={selectAndClose}
            onRescan={onRescan}
          />
          <div
            className="resizer"
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize library"
            aria-valuenow={sidebarWidth}
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            onPointerDown={startResize}
            onKeyDown={resizeOnKey}
          />
        </div>
        {drawerOpen && <div className="scrim" onClick={closeDrawer} />}
        <div className="work">{children}</div>
      </div>
    </div>
  )
}
