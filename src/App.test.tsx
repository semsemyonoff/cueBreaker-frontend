import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ScanPair, ScanResult } from './api/types'
import App from './App'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function scanResult(items: ScanPair[]): ScanResult {
  return {
    items,
    log: [],
    summary: {
      dirs_walked: items.length,
      albums: items.length,
      unsplit: items.length,
      skipped: 0,
      elapsed_ms: 0,
    },
  }
}

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const album = {
  path: 'Album',
  abs_path: '/input/Artist/Album',
  cue_files: ['album.cue'],
  flac_files: ['album.flac'],
  split_done: false,
  output_tracks: 0,
}

afterEach(() => {
  vi.unstubAllGlobals()
  // Selecting an album pushes `?album=…`, and jsdom keeps one location for the
  // whole file — so without this every later test would mount deep-linked into
  // whatever the previous one opened.
  window.history.replaceState(null, '', '/')
  document.title = 'cueBreaker'
})

/**
 * A backend whose every album previews two tracks and whose split never finishes —
 * so a job stays `splitting` for as long as a test needs to observe it.
 */
function splittingBackend(items: ScanPair[] | (() => ScanPair[])) {
  const scanned = typeof items === 'function' ? items : () => items
  return (url: string) => {
    if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
    if (url === '/api/scan') return Promise.resolve(jsonResponse(scanResult(scanned())))
    if (url === '/api/preview') {
      return Promise.resolve(
        jsonResponse({
          performer: 'Artist',
          title: 'Album',
          file: 'album.flac',
          genre: '',
          date: '',
          has_cover: false,
          split_done: false,
          output_tracks: 0,
          total_seconds: 60,
          tracks: [
            { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
            { number: 2, title: 'Two', performer: 'Artist', index: '00:30:00', start_seconds: 30 },
          ],
        })
      )
    }
    if (url === '/api/split')
      return Promise.resolve(jsonResponse({ job_id: 'j1', status: 'queued' }))
    if (url === '/api/status/j1') {
      return Promise.resolve(
        jsonResponse({
          status: 'splitting',
          message: 'Splitting',
          result_files: [],
          progress_current: 1,
          progress_total: 2,
          progress_detail: 'Track 1',
        })
      )
    }
    return Promise.resolve(jsonResponse([]))
  }
}

describe('App', () => {
  it('renders the app shell and the empty-scan state when no albums are found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
        return Promise.resolve(jsonResponse(scanResult([])))
      })
    )

    render(<App />)

    expect(await screen.findByLabelText('Toggle library')).toBeInTheDocument()
    expect(await screen.findByText('No unsplit CUE + FLAC albums found')).toBeInTheDocument()
  })

  it('prompts to select an album once albums are scanned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
        if (url === '/api/scan') return Promise.resolve(jsonResponse(scanResult([album])))
        return Promise.resolve(jsonResponse(scanResult([])))
      })
    )

    render(<App />)

    expect(await screen.findByText('Select an album from the library.')).toBeInTheDocument()
  })

  it('renders the scan-error box, not the empty state, when the scan fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
        return Promise.resolve(errorResponse(500, 'scan input dir: permission denied'))
      })
    )

    render(<App />)

    expect(await screen.findByText('Library scan failed')).toBeInTheDocument()
    expect(screen.getByText('scan input dir: permission denied')).toBeInTheDocument()
    expect(screen.queryByText('No unsplit CUE + FLAC albums found')).not.toBeInTheDocument()
  })

  it('retries the scan from the error box', async () => {
    let fail = true
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
      if (fail) return Promise.resolve(errorResponse(503, 'backend unavailable'))
      return Promise.resolve(jsonResponse(scanResult([])))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByText('Library scan failed')).toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('No unsplit CUE + FLAC albums found')).toBeInTheDocument()
    expect(screen.queryByText('Library scan failed')).not.toBeInTheDocument()
  })

  it('re-resolves the open album on rescan, so a changed cue list reaches the selector', async () => {
    let cueFiles = ['a.cue']
    const previewFor = (cue: string) => ({
      performer: 'Artist',
      title: cue === 'a.cue' ? 'A' : 'B',
      file: 'album.flac',
      genre: '',
      date: '',
      has_cover: false,
      split_done: false,
      output_tracks: 0,
      total_seconds: 60,
      tracks: [
        { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
        if (url === '/api/scan')
          return Promise.resolve(jsonResponse(scanResult([{ ...album, cue_files: cueFiles }])))
        if (url === '/api/preview' && init?.body) {
          const { cue_file: cue } = JSON.parse(String(init.body)) as { cue_file: string }
          return Promise.resolve(jsonResponse(previewFor(cue)))
        }
        return Promise.resolve(jsonResponse([]))
      })
    )

    render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    await screen.findByText('A')
    // One CUE, so no selector yet.
    expect(screen.queryByLabelText('CUE file')).toBeNull()

    cueFiles = ['a.cue', 'b.cue']
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))

    const select = (await screen.findByLabelText('CUE file')) as HTMLSelectElement
    expect(select.querySelectorAll('option')).toHaveLength(2)
  })

  it('clears the selection when a rescan no longer returns the open album', async () => {
    const other = { ...album, path: 'Other' }
    let items = [album, other]
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
        if (url === '/api/scan') return Promise.resolve(jsonResponse(scanResult(items)))
        if (url === '/api/preview') {
          return Promise.resolve(
            jsonResponse({
              performer: 'Artist',
              title: 'Album',
              file: 'album.flac',
              genre: '',
              date: '',
              has_cover: false,
              split_done: false,
              output_tracks: 0,
              total_seconds: 60,
              tracks: [
                {
                  number: 1,
                  title: 'One',
                  performer: 'Artist',
                  index: '00:00:00',
                  start_seconds: 0,
                },
              ],
            })
          )
        }
        return Promise.resolve(jsonResponse([]))
      })
    )

    render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    expect(await screen.findByText('One')).toBeInTheDocument()

    items = [other]
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))

    expect(await screen.findByText('Select an album from the library.')).toBeInTheDocument()
  })

  it('lifts a running split into the topbar and the tree row', async () => {
    const other = { ...album, path: 'Other' }
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album, other])))

    const { container } = render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    fireEvent.click(await screen.findByText('Split 2 tracks'))

    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting2 unsplit')
    )
    expect(container.querySelector('.dot')?.className).toBe('dot run')
    // Only the splitting album reports progress; its sibling keeps its cue count.
    const metas = [...container.querySelectorAll('.tameta')].map((el) => el.textContent)
    expect(metas).toEqual(['50%', '1 cue'])
  })

  it('keeps a running split tracked across a rescan that retains the album', async () => {
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album])))

    const { container } = render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    fireEvent.click(await screen.findByText('Split 2 tracks'))
    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting1 unsplit')
    )

    // The scanning spinner must not unmount the panel out from under the job:
    // that would discard its `jobRun` and stop `usePoll`, so the split would run
    // on with nothing polling it — no progress, and no refresh on completion.
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))

    expect(screen.queryByText('Scanning library…')).not.toBeInTheDocument()
    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting1 unsplit')
    )
    expect(container.querySelector('.dot')?.className).toBe('dot run')
    expect(container.querySelector('.tameta')?.textContent).toBe('50%')
  })

  it('clears the topbar splitting state when the album is switched away', async () => {
    const other = { ...album, path: 'Other' }
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album, other])))

    const { container } = render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    fireEvent.click(await screen.findByText('Split 2 tracks'))
    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting2 unsplit')
    )

    // The job keeps running on the backend, but it is no longer this panel's job —
    // the topbar must not keep claiming a split for the album now on screen.
    fireEvent.click(screen.getByText('Other'))

    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('2 albums2 unsplit')
    )
    expect(container.querySelector('.dot')?.className).toBe('dot')
  })

  it('clears the topbar splitting state when the panel unmounts', async () => {
    let items = [album]
    vi.stubGlobal('fetch', vi.fn(splittingBackend(() => items)))

    const { container } = render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    fireEvent.click(await screen.findByText('Split 2 tracks'))
    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting1 unsplit')
    )

    // A rescan that drops the album unmounts the panel mid-split.
    items = []
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))

    expect(await screen.findByText('No unsplit CUE + FLAC albums found')).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('0 albums0 unsplit')
    )
    expect(container.querySelector('.dot')?.className).toBe('dot')
  })

  it('self-corrects the topbar counter and the tree row when a job completes', async () => {
    // The backend that Finding 1 was found against: the split really finishes, and
    // the album is only `split_done` on the scan *after* it does.
    let done = false
    const scanned = () => [{ ...album, split_done: done, output_tracks: done ? 2 : 0 }]
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
      if (url === '/api/scan') return Promise.resolve(jsonResponse(scanResult(scanned())))
      if (url === '/api/preview') {
        return Promise.resolve(
          jsonResponse({
            performer: 'Artist',
            title: 'Album',
            file: 'album.flac',
            genre: '',
            date: '',
            has_cover: false,
            split_done: done,
            output_tracks: done ? 2 : 0,
            total_seconds: 60,
            tracks: [
              { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
              {
                number: 2,
                title: 'Two',
                performer: 'Artist',
                index: '00:30:00',
                start_seconds: 30,
              },
            ],
          })
        )
      }
      if (url === '/api/split')
        return Promise.resolve(jsonResponse({ job_id: 'j1', status: 'queued' }))
      if (url === '/api/status/j1') {
        done = true
        return Promise.resolve(
          jsonResponse({
            status: 'done',
            message: 'Done',
            result_files: ['01.flac', '02.flac'],
            progress_current: 2,
            progress_total: 2,
            progress_detail: '',
          })
        )
      }
      return Promise.resolve(jsonResponse([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    expect(container.querySelector('.tstat')?.textContent).toBe('1 albums1 unsplit')
    fireEvent.click(await screen.findByText('Split 2 tracks'))

    // No Rescan click anywhere in this test: every item-derived surface must
    // correct itself off the job's own completion.
    await vi.waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('1 albums0 unsplit')
    )
    // The row swaps its cue count for the ✓ and gains `done`.
    await vi.waitFor(() => expect(container.querySelector('.tcheck')?.textContent).toBe('✓'))
    expect(container.querySelector('.tameta')).toBeNull()
    expect(container.querySelector('.talbum')?.className).toContain('done')
  })

  it('does not re-scan when the album is switched', async () => {
    // Guards the overload the fix sketch warns about: the `activeJob` summary goes
    // null on album switch too, so a rescan keyed off it would fire here.
    const other = { ...album, path: 'Other' }
    const fetchMock = vi.fn(splittingBackend([album, other]))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByText('Select an album from the library.')
    const scansAfterMount = fetchMock.mock.calls.filter(([url]) => url === '/api/scan').length

    fireEvent.click(screen.getByText('Album'))
    await screen.findByText('Split 2 tracks')
    fireEvent.click(screen.getByText('Other'))
    await screen.findByText('Split 2 tracks')

    const scans = fetchMock.mock.calls.filter(([url]) => url === '/api/scan').length
    expect(scans).toBe(scansAfterMount)
  })

  /** `splittingBackend`, but with `/api/scan` failing while `fail()` is true. */
  function scanFailingBackend(fail: () => boolean) {
    const backend = splittingBackend([album])
    return (url: string) => {
      if (url === '/api/scan' && fail()) {
        return Promise.resolve(errorResponse(500, 'backend is down'))
      }
      return backend(url)
    }
  }

  it('surfaces a scan failure even while an album is selected', async () => {
    let fail = false
    vi.stubGlobal('fetch', vi.fn(scanFailingBackend(() => fail)))

    render(<App />)

    // Select the album, so the render chain reaches the `selected` branch.
    fireEvent.click(await screen.findByText('Album'))
    expect(screen.queryByText('Select an album from the library.')).not.toBeInTheDocument()

    fail = true
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))

    expect(await screen.findByText('Library scan failed')).toBeInTheDocument()
    expect(screen.getByText('backend is down')).toBeInTheDocument()
  })

  // The panel owns `jobRun`/`runToken` and drives `usePoll`, so replacing it with
  // the error would strand a split running behind the failed Rescan.
  it('keeps a running split polling through a failed rescan, alongside the error', async () => {
    let fail = false
    vi.stubGlobal('fetch', vi.fn(scanFailingBackend(() => fail)))

    const { container } = render(<App />)

    fireEvent.click(await screen.findByText('Album'))
    fireEvent.click(await screen.findByText('Split 2 tracks'))
    await waitFor(() =>
      expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting1 unsplit')
    )

    fail = true
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))

    expect(await screen.findByText('Library scan failed')).toBeInTheDocument()
    // The panel is still mounted and still polling: the topbar keeps its summary
    // and the statusrow keeps reporting progress.
    expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting1 unsplit')
    expect(screen.getByText('Track 1')).toBeInTheDocument()

    // Retry recovers and drops the banner without disturbing the split.
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByText('Library scan failed')).not.toBeInTheDocument())
    expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting1 unsplit')
  })
})

describe('App album addressing', () => {
  const other = { ...album, path: 'Other' }

  it('opens the album named by the URL on mount', async () => {
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album, other])))
    window.history.replaceState(null, '', '?album=Other')

    const { container } = render(<App />)

    await screen.findByText('Split 2 tracks')
    expect(container.querySelector('.talbum.active')?.textContent).toContain('Other')
  })

  it('carries the open album in the document title, and drops it again on Back', async () => {
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album, other])))

    render(<App />)
    await screen.findByText('Select an album from the library.')
    expect(document.title).toBe('cueBreaker')

    fireEvent.click(screen.getByText('Album'))
    await waitFor(() => expect(document.title).toBe('Album — cueBreaker'))

    window.history.back()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(document.title).toBe('cueBreaker'))
  })

  it('titles a deep-linked tab before the scan has resolved the album', async () => {
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album])))
    window.history.replaceState(null, '', '?album=Lossless%2FMarlow%20Trio')

    render(<App />)

    expect(document.title).toBe('Marlow Trio — cueBreaker')
  })

  it('shows no album when the URL names one the scan does not have', async () => {
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album])))
    window.history.replaceState(null, '', '?album=Gone')

    render(<App />)

    expect(await screen.findByText('Select an album from the library.')).toBeInTheDocument()
  })

  it('pushes the album URL on select, and Back returns to the previous album', async () => {
    vi.stubGlobal('fetch', vi.fn(splittingBackend([album, other])))

    const { container } = render(<App />)
    await screen.findByText('Select an album from the library.')

    fireEvent.click(screen.getByText('Album'))
    expect(window.location.search).toBe('?album=Album')
    fireEvent.click(screen.getByText('Other'))
    expect(window.location.search).toBe('?album=Other')
    await waitFor(() =>
      expect(container.querySelector('.talbum.active')?.textContent).toContain('Other')
    )

    // jsdom moves the location but never fires popstate itself.
    window.history.back()
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() =>
      expect(container.querySelector('.talbum.active')?.textContent).toContain('Album')
    )
  })
})
