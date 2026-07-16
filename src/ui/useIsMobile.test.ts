import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MOBILE_QUERY, useIsMobile } from './useIsMobile'

const desktopWidth = 1440

function setViewport(width: number) {
  act(() => {
    window.innerWidth = width
    window.dispatchEvent(new Event('resize'))
  })
}

afterEach(() => {
  window.innerWidth = desktopWidth
})

describe('useIsMobile', () => {
  it('matches the mobile viewport and not the desktop one', () => {
    window.innerWidth = 390
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)

    window.innerWidth = desktopWidth
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })

  it('updates when the viewport crosses the breakpoint', () => {
    window.innerWidth = desktopWidth
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    setViewport(390)
    expect(result.current).toBe(true)

    setViewport(desktopWidth)
    expect(result.current).toBe(false)
  })

  it('unsubscribes from the media query on unmount', () => {
    const query = window.matchMedia(MOBILE_QUERY)
    const removeEventListener = vi.spyOn(query, 'removeEventListener')
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(query)

    const { unmount } = renderHook(() => useIsMobile())
    unmount()

    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    matchMedia.mockRestore()
  })
})
