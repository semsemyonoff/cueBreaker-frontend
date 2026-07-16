import { useEffect, useState } from 'react'

// Mirrors the `@media (max-width: 900px)` breakpoint in `shell.css`. Kept here so
// the one place JS needs to know the viewport (the drawer's `inert`, which CSS
// cannot emit) stays in step with the stylesheet that drives everything else.
export const MOBILE_QUERY = '(max-width: 900px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY)
    setIsMobile(query.matches)

    function handleChange(event: MediaQueryListEvent) {
      setIsMobile(event.matches)
    }

    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
