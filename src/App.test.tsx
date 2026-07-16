import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
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
})

describe('App', () => {
  it('renders the app shell and the empty-scan state when no albums are found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
        return Promise.resolve(jsonResponse([]))
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
        if (url === '/api/scan') return Promise.resolve(jsonResponse([album]))
        return Promise.resolve(jsonResponse([]))
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
      return Promise.resolve(jsonResponse([]))
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
          return Promise.resolve(jsonResponse([{ ...album, cue_files: cueFiles }]))
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
        if (url === '/api/scan') return Promise.resolve(jsonResponse(items))
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

  it('surfaces a scan failure even while an album is selected', async () => {
    let fail = false
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/version') return Promise.resolve(jsonResponse({ version: '1.0.0' }))
      if (url === '/api/scan') {
        return fail
          ? Promise.resolve(errorResponse(500, 'backend is down'))
          : Promise.resolve(jsonResponse([album]))
      }
      return Promise.resolve(jsonResponse([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    // Select the album, so the render chain would reach the `selected` branch.
    fireEvent.click(await screen.findByText('Album'))
    expect(screen.queryByText('Select an album from the library.')).not.toBeInTheDocument()

    fail = true
    fireEvent.click(screen.getByRole('button', { name: 'Rescan' }))

    expect(await screen.findByText('Library scan failed')).toBeInTheDocument()
    expect(screen.getByText('backend is down')).toBeInTheDocument()
  })
})
