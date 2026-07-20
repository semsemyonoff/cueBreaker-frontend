import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStickyScroll } from './useStickyScroll'

interface Metrics {
  scrollHeight: number
  clientHeight: number
  scrollTop: number
}

function stub(el: HTMLElement, metrics: Metrics) {
  Object.defineProperty(el, 'scrollHeight', { value: metrics.scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: metrics.clientHeight, configurable: true })
  Object.defineProperty(el, 'scrollTop', {
    value: metrics.scrollTop,
    configurable: true,
    writable: true,
  })
}

describe('useStickyScroll', () => {
  it('pins to the bottom when already at the bottom and new content arrives', () => {
    const el = document.createElement('div')
    stub(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 300 })
    const ref = { current: el }

    const { rerender } = renderHook(({ deps }) => useStickyScroll(ref, deps), {
      initialProps: { deps: [1] },
    })

    stub(el, { scrollHeight: 700, clientHeight: 200, scrollTop: 300 })
    rerender({ deps: [2] })

    expect(el.scrollTop).toBe(700)
  })

  it('does not pin after a manual scroll up', () => {
    const el = document.createElement('div')
    stub(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 300 })
    const ref = { current: el }

    const { rerender } = renderHook(({ deps }) => useStickyScroll(ref, deps), {
      initialProps: { deps: [1] },
    })

    // Manual scroll up: far from the bottom.
    stub(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 })
    el.dispatchEvent(new Event('scroll'))

    stub(el, { scrollHeight: 700, clientHeight: 200, scrollTop: 0 })
    rerender({ deps: [2] })

    expect(el.scrollTop).toBe(0)
  })

  it('re-engages once scrolled back to the bottom', () => {
    const el = document.createElement('div')
    stub(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 300 })
    const ref = { current: el }

    const { rerender } = renderHook(({ deps }) => useStickyScroll(ref, deps), {
      initialProps: { deps: [1] },
    })

    // Scroll away, then back to (within threshold of) the bottom.
    stub(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 })
    el.dispatchEvent(new Event('scroll'))

    stub(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 300 })
    el.dispatchEvent(new Event('scroll'))

    stub(el, { scrollHeight: 900, clientHeight: 200, scrollTop: 300 })
    rerender({ deps: [2] })

    expect(el.scrollTop).toBe(900)
  })

  it('no-ops when there is no element attached', () => {
    const ref = { current: null }

    expect(() => {
      renderHook(({ deps }) => useStickyScroll(ref, deps), { initialProps: { deps: [1] } })
    }).not.toThrow()
  })

  it('detaches its scroll listener on unmount', () => {
    const el = document.createElement('div')
    stub(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 300 })
    const removeEventListener = vi.spyOn(el, 'removeEventListener')
    const ref = { current: el }

    const { unmount } = renderHook(({ deps }) => useStickyScroll(ref, deps), {
      initialProps: { deps: [1] },
    })
    unmount()

    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})
