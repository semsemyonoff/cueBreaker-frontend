import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// vitest is configured without `test.globals: true`, so @testing-library/react's
// afterEach-based auto-cleanup detection never fires; register it explicitly so
// component trees rendered in one test don't leak into the next.
afterEach(cleanup)

// Node 22+'s built-in global `localStorage` shadows jsdom's window.localStorage
// under Vitest's jsdom environment, leaving `window.localStorage` undefined.
// Replace it with a minimal in-memory polyfill so code under test can rely on
// `window.localStorage` the same way it would in a real browser.
if (!window.localStorage) {
  const store = new Map<string, string>()
  const polyfill: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(window, 'localStorage', { value: polyfill, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: polyfill, configurable: true })
}

// jsdom ships a `matchMedia` that never evaluates a query (it has no layout) and
// never emits `change`, so it is useless to `useIsMobile()`. Replace it with one
// that understands the `(max-width: Npx)` form the app uses and re-evaluates on
// window resize — a test drives the viewport by setting `window.innerWidth` and
// firing a `resize` event.
type MediaQueryListener = (event: MediaQueryListEvent) => void

function stubMatchMedia(query: string): MediaQueryList {
  const maxWidth = /\(max-width:\s*(\d+)px\)/.exec(query)?.[1]
  const evaluate = () => (maxWidth === undefined ? false : window.innerWidth <= Number(maxWidth))

  const listeners = new Set<MediaQueryListener>()
  let matches = evaluate()

  function handleResize() {
    const next = evaluate()
    if (next === matches) return
    matches = next
    const event = { matches, media: query } as MediaQueryListEvent
    listeners.forEach((listener) => listener(event))
  }

  return {
    media: query,
    onchange: null,
    get matches() {
      return matches
    },
    addEventListener: (_type: string, listener: MediaQueryListener) => {
      if (listeners.size === 0) window.addEventListener('resize', handleResize)
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: MediaQueryListener) => {
      listeners.delete(listener)
      if (listeners.size === 0) window.removeEventListener('resize', handleResize)
    },
    addListener: (listener: MediaQueryListener) => {
      if (listeners.size === 0) window.addEventListener('resize', handleResize)
      listeners.add(listener)
    },
    removeListener: (listener: MediaQueryListener) => {
      listeners.delete(listener)
      if (listeners.size === 0) window.removeEventListener('resize', handleResize)
    },
    dispatchEvent: () => false,
  } as unknown as MediaQueryList
}

Object.defineProperty(window, 'matchMedia', { value: stubMatchMedia, configurable: true })
