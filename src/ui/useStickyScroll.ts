import { useLayoutEffect, useRef, type RefObject } from 'react'

const STICK_THRESHOLD = 24

/**
 * Keeps a scrollable element pinned to the bottom while the user has not scrolled
 * away from it. Re-engages once the user scrolls back to the bottom.
 */
export function useStickyScroll(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[]
): void {
  const stuck = useRef(true)
  const observed = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // A collapsed panel unmounts its scroller, so reopening it mounts a fresh
    // element at scrollTop 0. `stuck` outlives that element: without re-arming,
    // a log the user had scrolled up in reopens showing the oldest entries.
    if (observed.current !== el) {
      observed.current = el
      stuck.current = true
    }

    const handleScroll = () => {
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
    }

    el.addEventListener('scroll', handleScroll)
    if (stuck.current) {
      el.scrollTop = el.scrollHeight
    }

    return () => el.removeEventListener('scroll', handleScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
