import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ScanPair } from '../api/types'
import AlbumPanel from './AlbumPanel'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubPreview(byCue: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/preview' && init?.body) {
        const { cue_file: cueFile } = JSON.parse(String(init.body)) as { cue_file: string }
        return Promise.resolve(jsonResponse(byCue[cueFile]))
      }
      return Promise.resolve(jsonResponse({}))
    })
  )
}

const item: ScanPair = {
  path: 'Artist/Album',
  abs_path: '/input/Artist/Album',
  cue_files: ['album.cue'],
  flac_files: ['album.flac'],
  split_done: false,
  output_tracks: 0,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AlbumPanel', () => {
  it('renders title, chips, and the unsplit pill from preview data', async () => {
    stubPreview({
      'album.cue': {
        performer: 'Artist',
        title: 'Album',
        file: 'album.flac',
        genre: 'Rock',
        date: '1999',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 120,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
          { number: 2, title: 'Two', performer: 'Artist', index: '02:00:00', start_seconds: 120 },
        ],
      },
    })

    render(<AlbumPanel item={item} />)

    expect(await screen.findByText('Album')).toBeInTheDocument()
    expect(screen.getAllByText('Artist').length).toBeGreaterThan(0)
    expect(screen.getByText('Rock')).toBeInTheDocument()
    expect(screen.getByText('1999')).toBeInTheDocument()
    expect(screen.getByText('Unsplit')).toBeInTheDocument()
    expect(screen.getByText('no cover')).toBeInTheDocument()
  })

  it('renders the source line and the waveform timecode endpoints from preview data', async () => {
    stubPreview({
      'album.cue': {
        performer: 'Artist',
        title: 'Album',
        file: 'Blue Meridian.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 3684,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    })

    const { container } = render(<AlbumPanel item={item} />)

    expect(await screen.findByText('Album')).toBeInTheDocument()
    expect(container.querySelector('.srcline')?.textContent).toBe(
      'source: Blue Meridian.flac · 61:24'
    )
    const wtime = container.querySelector('.wtime')
    expect([...(wtime?.querySelectorAll('span') ?? [])].map((s) => s.textContent)).toEqual([
      '00:00',
      '61:24',
    ])
  })

  it('drops the timecode row once the album is split (idle-state only, per the prototype)', async () => {
    stubPreview({
      'album.cue': {
        performer: 'Artist',
        title: 'Album',
        file: 'album.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: true,
        output_tracks: 1,
        total_seconds: 3684,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    })

    const { container } = render(<AlbumPanel item={item} />)

    expect(await screen.findByText('Split')).toBeInTheDocument()
    expect(container.querySelector('.wtime')).toBeNull()
    // The source line is not idle-gated — it identifies the FLAC in every state.
    expect(container.querySelector('.srcline')?.textContent).toBe('source: album.flac · 61:24')
  })

  it('shows the done pill and cover image when split_done and has_cover are true', async () => {
    stubPreview({
      'album.cue': {
        performer: 'Artist',
        title: 'Album',
        file: 'album.flac',
        genre: '',
        date: '',
        has_cover: true,
        cover_name: 'cover.jpg',
        split_done: true,
        output_tracks: 1,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    })

    const { container } = render(<AlbumPanel item={item} />)

    expect(await screen.findByText('Split')).toBeInTheDocument()
    expect(container.querySelector('img.cover')).not.toBeNull()
  })

  it('shows a CUE selector only when the album has more than one CUE file, and re-previews on change', async () => {
    stubPreview({
      'a.cue': {
        performer: 'Artist',
        title: 'A',
        file: 'a.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
      'b.cue': {
        performer: 'Artist',
        title: 'B',
        file: 'b.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'Uno', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    })

    const multiCue: ScanPair = { ...item, cue_files: ['a.cue', 'b.cue'] }
    render(<AlbumPanel item={multiCue} />)

    const select = (await screen.findByLabelText('CUE file')) as HTMLSelectElement
    expect(select.querySelectorAll('option')).toHaveLength(2)

    expect(await screen.findByText('A')).toBeInTheDocument()

    select.value = 'b.cue'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect(await screen.findByText('B')).toBeInTheDocument()
  })

  it('renders no CUE selector for a single-CUE album', async () => {
    stubPreview({
      'album.cue': {
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
        ],
      },
    })

    render(<AlbumPanel item={item} />)

    await screen.findByText('Album')
    expect(screen.queryByLabelText('CUE file')).toBeNull()
  })

  it('splits, polls status, and renders the results list on done', async () => {
    const previewBody = {
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
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/split')
          return Promise.resolve(
            jsonResponse({ job_id: 'Artist/Album/album.cue', status: 'queued' }, 202)
          )
        if (url === '/api/status/Artist/Album/album.cue') {
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01 - One.flac', '02 - Two.flac'],
              progress_current: 4,
              progress_total: 4,
              progress_detail: 'Complete',
            })
          )
        }
        return Promise.resolve(jsonResponse({}))
      })
    )

    render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 2 tracks'))

    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()
    expect(screen.getByText('01 - One.flac')).toBeInTheDocument()
    expect(screen.getByText('02 - Two.flac')).toBeInTheDocument()
    expect(screen.getByText('Split again')).toBeInTheDocument()
  })

  it('shows an overwrite warning when the album is already split', async () => {
    stubPreview({
      'album.cue': {
        performer: 'Artist',
        title: 'Album',
        file: 'album.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: true,
        output_tracks: 2,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    })

    render(<AlbumPanel item={item} />)

    expect(await screen.findByText('Output already exists')).toBeInTheDocument()
    expect(screen.getByText('Split again (2 in output)')).toBeInTheDocument()
  })

  it('refetches the preview once a job completes, so output state is not left stale', async () => {
    const track = {
      number: 1,
      title: 'One',
      performer: 'Artist',
      index: '00:00:00',
      start_seconds: 0,
    }
    const base = {
      performer: 'Artist',
      title: 'Album',
      file: 'album.flac',
      genre: '',
      date: '',
      has_cover: false,
      total_seconds: 60,
      tracks: [track],
    }
    let previewCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') {
          previewCalls += 1
          // The split writes to /output between the first and second call.
          return Promise.resolve(
            jsonResponse(
              previewCalls === 1
                ? { ...base, split_done: false, output_tracks: 0 }
                : { ...base, split_done: true, output_tracks: 1 }
            )
          )
        }
        if (url === '/api/split')
          return Promise.resolve(jsonResponse({ job_id: 'job-1', status: 'queued' }, 202))
        if (url === '/api/status/job-1') {
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01 - One.flac'],
              progress_current: 1,
              progress_total: 1,
              progress_detail: 'Complete',
            })
          )
        }
        return Promise.resolve(jsonResponse({}))
      })
    )

    render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 1 tracks'))
    await screen.findByText('Split completed successfully')

    await vi.waitFor(() => expect(previewCalls).toBe(2))
    // The refetched preview is swapped in place — the panel must not flash back to Loading…
    expect(screen.getByText('Split completed successfully')).toBeInTheDocument()
  })

  it('refetches the preview when the owner bumps refreshToken', async () => {
    const track = {
      number: 1,
      title: 'One',
      performer: 'Artist',
      index: '00:00:00',
      start_seconds: 0,
    }
    const base = {
      performer: 'Artist',
      title: 'Album',
      file: 'album.flac',
      genre: '',
      date: '',
      has_cover: false,
      total_seconds: 60,
      tracks: [track],
    }
    let previewCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') {
          previewCalls += 1
          return Promise.resolve(
            jsonResponse(
              previewCalls === 1
                ? { ...base, split_done: false, output_tracks: 0 }
                : { ...base, split_done: true, output_tracks: 2 }
            )
          )
        }
        return Promise.resolve(jsonResponse({}))
      })
    )

    const { rerender } = render(<AlbumPanel item={item} refreshToken={0} />)
    expect(await screen.findByText('Split 1 tracks')).toBeInTheDocument()

    rerender(<AlbumPanel item={item} refreshToken={1} />)

    expect(await screen.findByText('Output already exists')).toBeInTheDocument()
    expect(screen.getByText('Split again (2 in output)')).toBeInTheDocument()
  })

  it('keeps a still-valid CUE selection when the cue list is handed back by a rescan', async () => {
    stubPreview({
      'a.cue': {
        performer: 'Artist',
        title: 'A',
        file: 'a.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
      'b.cue': {
        performer: 'Artist',
        title: 'B',
        file: 'b.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'Uno', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    })

    const multiCue: ScanPair = { ...item, cue_files: ['a.cue', 'b.cue'] }
    const { rerender } = render(<AlbumPanel item={multiCue} />)

    const select = (await screen.findByLabelText('CUE file')) as HTMLSelectElement
    select.value = 'b.cue'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(await screen.findByText('B')).toBeInTheDocument()

    // A rescan returns an equal-but-new ScanPair; the chosen CUE must survive it.
    rerender(<AlbumPanel item={{ ...multiCue, cue_files: ['a.cue', 'b.cue'] }} />)

    expect(await screen.findByText('B')).toBeInTheDocument()
  })

  it('falls back to the first CUE when a rescan drops the selected one', async () => {
    stubPreview({
      'a.cue': {
        performer: 'Artist',
        title: 'A',
        file: 'a.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
      'b.cue': {
        performer: 'Artist',
        title: 'B',
        file: 'b.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'Uno', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    })

    const multiCue: ScanPair = { ...item, cue_files: ['a.cue', 'b.cue'] }
    const { rerender } = render(<AlbumPanel item={multiCue} />)

    const select = (await screen.findByLabelText('CUE file')) as HTMLSelectElement
    select.value = 'b.cue'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(await screen.findByText('B')).toBeInTheDocument()

    rerender(<AlbumPanel item={{ ...multiCue, cue_files: ['a.cue'] }} />)

    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(screen.queryByLabelText('CUE file')).toBeNull()
  })

  it('fires exactly one preview per album switch, pairing each album with its own CUE', async () => {
    const previews: Record<string, unknown> = {
      'a.cue': {
        performer: 'Artist',
        title: 'A',
        file: 'a.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
      'b.cue': {
        performer: 'Artist',
        title: 'B',
        file: 'b.flac',
        genre: '',
        date: '',
        has_cover: false,
        split_done: false,
        output_tracks: 0,
        total_seconds: 60,
        tracks: [
          { number: 1, title: 'Uno', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
        ],
      },
    }
    const requests: { path: string; cue_file: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/preview' && init?.body) {
          const body = JSON.parse(String(init.body)) as { path: string; cue_file: string }
          requests.push(body)
          const preview = previews[body.cue_file]
          // The backend 404s a CUE the album does not own — exactly the bogus
          // pairing this test exists to prove we never send.
          if (!preview) return Promise.resolve(jsonResponse({ error: 'CUE file not found' }, 404))
          return Promise.resolve(jsonResponse(preview))
        }
        return Promise.resolve(jsonResponse({}))
      })
    )

    const albumA: ScanPair = { ...item, path: 'Artist/A', cue_files: ['a.cue'] }
    const albumB: ScanPair = { ...item, path: 'Artist/B', cue_files: ['b.cue'] }

    const { rerender } = render(<AlbumPanel item={albumA} />)
    expect(await screen.findByText('A')).toBeInTheDocument()

    rerender(<AlbumPanel item={albumB} />)
    expect(await screen.findByText('B')).toBeInTheDocument()

    expect(requests).toEqual([
      { path: 'Artist/A', cue_file: 'a.cue' },
      { path: 'Artist/B', cue_file: 'b.cue' },
    ])
  })

  it('shows a retry option when the split request itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
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
        if (url === '/api/split')
          return Promise.resolve(jsonResponse({ error: 'Already in progress' }, 409))
        return Promise.resolve(jsonResponse({}))
      })
    )

    render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 1 tracks'))

    expect(await screen.findByText('Already in progress')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('renders the loading branch while the preview request is in flight', async () => {
    let resolvePreview: (res: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      resolvePreview = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url === '/api/preview' ? pending : Promise.resolve(jsonResponse({}))))
    )

    const { container } = render(<AlbumPanel item={item} />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    // The breadcrumb renders in all three branches, so the user knows what is loading.
    expect(container.querySelector('.crumbs')).toBeInTheDocument()
    expect(container.querySelector('.errbox')).toBeNull()

    resolvePreview(
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
        ],
      })
    )

    expect(await screen.findByText('Album')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('stays on Loading… without issuing a request for an album with no CUE files', async () => {
    // ⚠️ Pins today's behaviour, which is a dead end for the user: `cueFile` is ''
    // so the preview effect returns early (AlbumPanel.tsx:71) and nothing ever
    // resolves. Scan only lists CUE+FLAC pairs, so this shape should not reach the
    // panel — recorded so the strand is a decision, not a surprise.
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})))
    vi.stubGlobal('fetch', fetchMock)

    render(<AlbumPanel item={{ ...item, cue_files: [] }} />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('CUE file')).toBeNull()
  })

  it('surfaces a job that fails mid-split, leaving the running pill and waveform behind', async () => {
    const previewBody = {
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
    }
    // The likeliest real outcome on a bad CUE: the job reports progress, then dies.
    const polls = [
      {
        status: 'splitting',
        message: 'Splitting',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: 'track 1',
      },
      {
        status: 'error',
        message: 'shnsplit: cannot read input',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: '',
      },
    ]
    let poll = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/split')
          return Promise.resolve(jsonResponse({ job_id: 'job-1', status: 'queued' }, 202))
        if (url === '/api/status/job-1') {
          const body = polls[Math.min(poll, polls.length - 1)]
          poll += 1
          return Promise.resolve(jsonResponse(body))
        }
        return Promise.resolve(jsonResponse({}))
      })
    )

    const { container } = render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 2 tracks'))

    // Mid-split: the ambient state says running everywhere.
    expect(await screen.findByText('Splitting')).toBeInTheDocument()
    expect(container.querySelector('.pill-run')).not.toBeNull()
    expect(container.querySelector('.wave--active')).not.toBeNull()

    expect(await screen.findByText('Split failed')).toBeInTheDocument()
    expect(screen.getByText('shnsplit: cannot read input')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
    // The failure must retract the running state, not sit alongside it.
    expect(container.querySelector('.pill-run')).toBeNull()
    expect(container.querySelector('.wave--active')).toBeNull()
    expect(container.querySelector('.statusrow')).toBeNull()
    expect(screen.getByText('Unsplit')).toBeInTheDocument()
  })

  it('renders a failed preview in the designed errbox, not a bare paragraph', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview')
          return Promise.resolve(jsonResponse({ error: 'CUE file not found' }, 404))
        return Promise.resolve(jsonResponse({}))
      })
    )

    const { container } = render(<AlbumPanel item={item} />)

    const head = await screen.findByText('Preview failed')
    expect(head).toBeInTheDocument()
    expect(screen.getByText('CUE file not found')).toBeInTheDocument()
    // The errbox is the same element split errors use — one error language, not two.
    expect(container.querySelector('.errbox')).toBeInTheDocument()
    expect(container.querySelector('.album-error')).toBeNull()
    // The breadcrumb stays, so the user still knows which album failed.
    expect(container.querySelector('.crumbs')).toBeInTheDocument()
  })

  it('recovers from a failed refetch once a later one succeeds', async () => {
    const body = {
      performer: 'Artist',
      title: 'Album',
      file: 'album.flac',
      genre: '',
      date: '',
      has_cover: false,
      split_done: false,
      output_tracks: 0,
      total_seconds: 120,
      tracks: [
        { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
      ],
    }
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') {
          calls += 1
          // Succeed, fail the refetch, then succeed again.
          return Promise.resolve(
            calls === 2 ? jsonResponse({ error: 'backend hiccup' }, 500) : jsonResponse(body)
          )
        }
        return Promise.resolve(jsonResponse({}))
      })
    )

    const { rerender } = render(<AlbumPanel item={item} refreshToken={0} />)
    expect(await screen.findByText('Album')).toBeInTheDocument()

    rerender(<AlbumPanel item={item} refreshToken={1} />)
    expect(await screen.findByText('Preview failed')).toBeInTheDocument()

    // The error must not outlive the failure that set it: the panel is keyed on
    // the same album throughout, so nothing else would ever clear it.
    rerender(<AlbumPanel item={item} refreshToken={2} />)
    expect(await screen.findByText('Album')).toBeInTheDocument()
    expect(screen.queryByText('Preview failed')).toBeNull()
  })

  it('reports a completed job once, not again when the album is revisited', async () => {
    const other: ScanPair = { ...item, path: 'Artist/Other' }
    const previewFor = (title: string) => ({
      performer: 'Artist',
      title,
      file: 'album.flac',
      genre: '',
      date: '',
      has_cover: false,
      split_done: false,
      output_tracks: 0,
      total_seconds: 120,
      tracks: [
        { number: 1, title: 'One', performer: 'Artist', index: '00:00:00', start_seconds: 0 },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/preview') {
          const { path } = JSON.parse(String(init?.body)) as { path: string }
          return Promise.resolve(jsonResponse(previewFor(path)))
        }
        if (url === '/api/split') return Promise.resolve(jsonResponse({ job_id: 'j1' }, 202))
        if (url.startsWith('/api/status/'))
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01.flac'],
              progress_current: 1,
              progress_total: 1,
              progress_detail: '',
            })
          )
        return Promise.resolve(jsonResponse({}))
      })
    )

    const onJobDone = vi.fn()
    const { rerender } = render(<AlbumPanel item={item} onJobDone={onJobDone} />)

    fireEvent.click(await screen.findByText('Split 1 tracks'))
    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()
    expect(onJobDone).toHaveBeenCalledTimes(1)

    // `jobRun` survives an album switch by design, so coming back restores the
    // job id and re-polls the same `done`. That must not re-signal the owner —
    // it would re-scan the whole library on every visit to a split album.
    rerender(<AlbumPanel item={other} onJobDone={onJobDone} />)
    expect(await screen.findByText('Artist/Other')).toBeInTheDocument()
    rerender(<AlbumPanel item={item} onJobDone={onJobDone} />)
    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()

    expect(onJobDone).toHaveBeenCalledTimes(1)
  })
})
