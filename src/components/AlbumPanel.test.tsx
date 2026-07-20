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

// The backend 404s a status lookup for a job it never enqueued — the restore effect
// that now fires on every AlbumPanel mount relies on that, so every fetch stub below
// must answer `/api/status/…` the same way unless a test deliberately overrides it.
function notFound() {
  return Promise.resolve(jsonResponse({ error: 'not found' }, 404))
}

function stubPreview(byCue: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/preview' && init?.body) {
        const { cue_file: cueFile } = JSON.parse(String(init.body)) as { cue_file: string }
        return Promise.resolve(jsonResponse(byCue[cueFile]))
      }
      if (url.startsWith('/api/status/')) return notFound()
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
    // The job id here is the deterministic `path/cue_file` form, identical to what
    // AlbumPanel's mount-time restore effect requests — so the status handler must
    // stay a 404 until the split is actually accepted, or the restore would report
    // the album already done before the user ever clicks Split.
    let splitAccepted = false
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/split') {
          splitAccepted = true
          return Promise.resolve(
            jsonResponse({ job_id: 'Artist/Album/album.cue', status: 'queued' }, 202)
          )
        }
        if (url === '/api/status/Artist/Album/album.cue') {
          if (!splitAccepted) return notFound()
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01 - One.flac', '02 - Two.flac'],
              progress_current: 4,
              progress_total: 4,
              progress_detail: 'Complete',
              log: [],
              log_next: 0,
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
              log: [],
              log_next: 0,
            })
          )
        }
        if (url.startsWith('/api/status/')) return notFound()
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
        if (url.startsWith('/api/status/')) return notFound()
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
        if (url.startsWith('/api/status/')) return notFound()
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
        if (url.startsWith('/api/status/')) return notFound()
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
      vi.fn((url: string) => {
        if (url === '/api/preview') return pending
        if (url.startsWith('/api/status/')) return notFound()
        return Promise.resolve(jsonResponse({}))
      })
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
    // panel — recorded so the strand is a decision, not a surprise. The job-restore
    // effect shares the same `!cueFile` guard, so this also covers it issuing no
    // request.
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
        log: [],
        log_next: 0,
      },
      {
        status: 'error',
        message: 'shnsplit: cannot read input',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: '',
        log: [],
        log_next: 0,
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
        if (url.startsWith('/api/status/')) return notFound()
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
        if (url.startsWith('/api/status/')) return notFound()
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
        if (url.startsWith('/api/status/')) return notFound()
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
        // Only the id actually returned by /api/split is a real job — every other
        // /api/status/… request is the mount-time restore effect asking about an
        // album that was never split, and the real backend would 404 that.
        if (url === '/api/status/j1')
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01.flac'],
              progress_current: 1,
              progress_total: 1,
              progress_detail: '',
              log: [],
              log_next: 0,
            })
          )
        if (url.startsWith('/api/status/')) return notFound()
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

  it('restores a finished job on mount without re-signalling onJobDone', async () => {
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
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/status/Artist/Album/album.cue')
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01 - One.flac'],
              progress_current: 1,
              progress_total: 1,
              progress_detail: 'Complete',
              log: [],
              log_next: 0,
            })
          )
        return Promise.resolve(jsonResponse({}))
      })
    )

    const onJobDone = vi.fn()
    render(<AlbumPanel item={item} onJobDone={onJobDone} />)

    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()
    expect(screen.getByText('01 - One.flac')).toBeInTheDocument()
    expect(onJobDone).not.toHaveBeenCalled()
  })

  it('restores an active job on mount, resumes polling, and signals onJobDone once it completes', async () => {
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
    let statusCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/status/Artist/Album/album.cue') {
          statusCalls += 1
          // Call 1 is the restore effect's own probe (which only decides whether to
          // set jobRun); call 2 is usePoll's first tick once jobId is set — it never
          // reuses the restore's response, so it must see "splitting" too or the
          // active state is skipped entirely and rendered straight as done.
          if (statusCalls <= 2) {
            return Promise.resolve(
              jsonResponse({
                status: 'splitting',
                message: 'Splitting',
                result_files: [],
                progress_current: 1,
                progress_total: 2,
                progress_detail: 'track 1',
                log: [],
                log_next: 0,
              })
            )
          }
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01 - One.flac', '02 - Two.flac'],
              progress_current: 2,
              progress_total: 2,
              progress_detail: 'Complete',
              log: [],
              log_next: 0,
            })
          )
        }
        return Promise.resolve(jsonResponse({}))
      })
    )

    const onJobDone = vi.fn()
    render(<AlbumPanel item={item} onJobDone={onJobDone} />)

    expect(await screen.findByText('Splitting')).toBeInTheDocument()
    expect(onJobDone).not.toHaveBeenCalled()

    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()
    expect(onJobDone).toHaveBeenCalledTimes(1)
  })

  it('does not let a slow restore response overwrite a split the user already started', async () => {
    let resolveRestore: (res: Response) => void = () => {}
    const pendingRestore = new Promise<Response>((resolve) => {
      resolveRestore = resolve
    })
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
          return Promise.resolve(jsonResponse({ job_id: 'fresh-job', status: 'queued' }, 202))
        // The restore effect fires on mount and requests this exact deterministic id;
        // it is left unresolved until after the user has started a fresh run below.
        if (url === '/api/status/Artist/Album/album.cue') return pendingRestore
        if (url === '/api/status/fresh-job')
          return Promise.resolve(
            jsonResponse({
              status: 'splitting',
              message: 'Splitting',
              result_files: [],
              progress_current: 1,
              progress_total: 2,
              progress_detail: 'track 1',
              log: [],
              log_next: 0,
            })
          )
        return Promise.resolve(jsonResponse({}))
      })
    )

    render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 2 tracks'))
    expect(await screen.findByText('Splitting')).toBeInTheDocument()

    // The stale restore now resolves as `done` — after the fresh split is already
    // tracked under its own job id. It must not clobber the run in progress.
    resolveRestore(
      jsonResponse({
        status: 'done',
        message: 'Split complete',
        result_files: ['01 - One.flac', '02 - Two.flac'],
        progress_current: 4,
        progress_total: 4,
        progress_detail: 'Complete',
        log: [],
        log_next: 0,
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByText('Splitting')).toBeInTheDocument()
    expect(screen.queryByText('Split completed successfully')).toBeNull()
  })

  it('auto-expands the split log when a job fails', async () => {
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
    const polls = [
      {
        status: 'splitting',
        message: 'Splitting',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: 'track 1',
        log: [{ seq: 1, time: '2026-07-20T14:00:00Z', level: 'info', text: 'track 01/04' }],
        log_next: 1,
      },
      {
        status: 'error',
        message: 'shnsplit: cannot read input',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: '',
        log: [
          {
            seq: 2,
            time: '2026-07-20T14:00:01Z',
            level: 'error',
            text: 'shnsplit stderr: file not found',
          },
        ],
        log_next: 2,
      },
    ]
    let poll = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/split')
          return Promise.resolve(jsonResponse({ job_id: 'job-1', status: 'queued' }, 202))
        if (url.startsWith('/api/status/job-1')) {
          const body = polls[Math.min(poll, polls.length - 1)]
          poll += 1
          return Promise.resolve(jsonResponse(body))
        }
        if (url.startsWith('/api/status/')) return notFound()
        return Promise.resolve(jsonResponse({}))
      })
    )

    render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 2 tracks'))

    expect(await screen.findByText('Split failed')).toBeInTheDocument()
    const logButton = await screen.findByRole('button', { name: /split log/i })
    expect(logButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('shnsplit stderr: file not found')).toBeInTheDocument()
  })

  it('keeps the split log closed once the user closes it, even as later renders occur', async () => {
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
    const polls = [
      {
        status: 'splitting',
        message: 'Splitting',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: 'track 1',
        log: [],
        log_next: 0,
      },
      {
        status: 'error',
        message: 'shnsplit: cannot read input',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: '',
        log: [
          {
            seq: 1,
            time: '2026-07-20T14:00:01Z',
            level: 'error',
            text: 'shnsplit stderr: file not found',
          },
        ],
        log_next: 1,
      },
    ]
    let poll = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/split')
          return Promise.resolve(jsonResponse({ job_id: 'job-1', status: 'queued' }, 202))
        if (url.startsWith('/api/status/job-1')) {
          const body = polls[Math.min(poll, polls.length - 1)]
          poll += 1
          return Promise.resolve(jsonResponse(body))
        }
        if (url.startsWith('/api/status/')) return notFound()
        return Promise.resolve(jsonResponse({}))
      })
    )

    const { rerender } = render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 2 tracks'))
    expect(await screen.findByText('Split failed')).toBeInTheDocument()

    const logButton = await screen.findByRole('button', { name: /split log/i })
    expect(logButton).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(logButton)
    expect(logButton).toHaveAttribute('aria-expanded', 'false')

    // A later, unrelated render pass (e.g. the owner bumping refreshToken) must not
    // resurrect the panel the user just closed.
    rerender(<AlbumPanel item={item} refreshToken={1} />)
    expect(await screen.findByText('Split failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /split log/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('auto-expands the split log again for a new failed run after Retry', async () => {
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
    const polls = [
      {
        status: 'splitting',
        message: 'Splitting',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: 'track 1',
        log: [],
        log_next: 0,
      },
      {
        status: 'error',
        message: 'shnsplit: cannot read input',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: '',
        log: [{ seq: 1, time: '2026-07-20T14:00:01Z', level: 'error', text: 'first failure' }],
        log_next: 1,
      },
      {
        status: 'splitting',
        message: 'Splitting',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: 'track 1',
        log: [],
        log_next: 0,
      },
      {
        status: 'error',
        message: 'shnsplit: cannot read input',
        result_files: [],
        progress_current: 1,
        progress_total: 4,
        progress_detail: '',
        log: [{ seq: 1, time: '2026-07-20T14:00:02Z', level: 'error', text: 'second failure' }],
        log_next: 1,
      },
    ]
    let poll = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/split')
          return Promise.resolve(jsonResponse({ job_id: 'job-1', status: 'queued' }, 202))
        if (url.startsWith('/api/status/job-1')) {
          const body = polls[Math.min(poll, polls.length - 1)]
          poll += 1
          return Promise.resolve(jsonResponse(body))
        }
        if (url.startsWith('/api/status/')) return notFound()
        return Promise.resolve(jsonResponse({}))
      })
    )

    render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 2 tracks'))
    expect(await screen.findByText('Split failed')).toBeInTheDocument()
    // The auto-expand runs in an effect, so the log body lands one commit after
    // 'Split failed' — a synchronous getByText here races that second render.
    expect(await screen.findByText('first failure')).toBeInTheDocument()

    const logButton = await screen.findByRole('button', { name: /split log/i })
    expect(logButton).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(logButton)
    expect(logButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(await screen.findByText('Retry'))

    await screen.findByText('Splitting')
    expect(await screen.findByText('Split failed')).toBeInTheDocument()
    expect(await screen.findByText('second failure')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /split log/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('renders split log entries from usePoll in order, surviving a switch back to the same album', async () => {
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
    const doneLog = [
      { seq: 1, time: '2026-07-20T14:00:00Z', level: 'info', text: 'cue parsed: 2 tracks' },
      { seq: 2, time: '2026-07-20T14:00:01Z', level: 'info', text: 'track 01/02 → 01 - One.flac' },
      { seq: 3, time: '2026-07-20T14:00:02Z', level: 'info', text: 'done: 2 files' },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/split')
          return Promise.resolve(jsonResponse({ job_id: 'job-1', status: 'queued' }, 202))
        if (url.startsWith('/api/status/job-1'))
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01 - One.flac', '02 - Two.flac'],
              progress_current: 2,
              progress_total: 2,
              progress_detail: 'Complete',
              log: doneLog,
              log_next: 3,
            })
          )
        if (url.startsWith('/api/status/')) return notFound()
        return Promise.resolve(jsonResponse({}))
      })
    )

    const other: ScanPair = { ...item, path: 'Artist/Other' }
    const { rerender } = render(<AlbumPanel item={item} />)

    fireEvent.click(await screen.findByText('Split 2 tracks'))
    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /split log/i }))
    await screen.findByText('done: 2 files')

    const entryTexts = () =>
      ['cue parsed: 2 tracks', 'track 01/02 → 01 - One.flac', 'done: 2 files'].map(
        (text) => screen.getByText(text).textContent
      )
    expect(entryTexts()).toEqual([
      'cue parsed: 2 tracks',
      'track 01/02 → 01 - One.flac',
      'done: 2 files',
    ])

    rerender(<AlbumPanel item={other} />)
    expect(await screen.findByText('Other')).toBeInTheDocument()

    rerender(<AlbumPanel item={item} />)
    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()
    // The album switch collapses the panel (a failed run's auto-expand must not
    // follow the user to the next album), so reopen it to inspect the entries.
    expect(screen.getByRole('button', { name: /split log/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    fireEvent.click(screen.getByRole('button', { name: /split log/i }))
    await screen.findByText('done: 2 files')
    expect(entryTexts()).toEqual([
      'cue parsed: 2 tracks',
      'track 01/02 → 01 - One.flac',
      'done: 2 files',
    ])
  })

  it('renders log entries for a job restored from the backend on mount', async () => {
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
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody))
        if (url === '/api/status/Artist/Album/album.cue')
          return Promise.resolve(
            jsonResponse({
              status: 'done',
              message: 'Split complete',
              result_files: ['01 - One.flac'],
              progress_current: 1,
              progress_total: 1,
              progress_detail: 'Complete',
              log: [
                {
                  seq: 1,
                  time: '2026-07-20T14:00:00Z',
                  level: 'info',
                  text: 'cue parsed: 1 tracks',
                },
                { seq: 2, time: '2026-07-20T14:00:01Z', level: 'info', text: 'done: 1 files' },
              ],
              log_next: 2,
            })
          )
        return Promise.resolve(jsonResponse({}))
      })
    )

    render(<AlbumPanel item={item} />)

    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /split log/i }))

    expect(await screen.findByText('cue parsed: 1 tracks')).toBeInTheDocument()
    expect(screen.getByText('done: 1 files')).toBeInTheDocument()
  })

  // `jobRun` outlives an album switch, so a restore guard that merely asked
  // "is any job set?" would discard every later album's restore once one split
  // had run in the session — the second album would show no result and no log.
  it('restores a job for a second album after a first album has already split', async () => {
    const previewBody = (title: string) => ({
      performer: 'Artist',
      title,
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
    const statusBody = (text: string) => ({
      status: 'done',
      message: 'Split complete',
      result_files: ['01 - One.flac'],
      progress_current: 1,
      progress_total: 1,
      progress_detail: 'Complete',
      log: [{ seq: 1, time: '2026-07-20T14:00:00Z', level: 'info', text }],
      log_next: 2,
    })

    let previewTitle = 'Album'
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/preview') return Promise.resolve(jsonResponse(previewBody(previewTitle)))
        if (url === '/api/status/Artist/Album/album.cue')
          return Promise.resolve(jsonResponse(statusBody('first album line')))
        if (url === '/api/status/Artist/Second/album.cue')
          return Promise.resolve(jsonResponse(statusBody('second album line')))
        if (url.startsWith('/api/status/')) return notFound()
        return Promise.resolve(jsonResponse({}))
      })
    )

    const { rerender } = render(<AlbumPanel item={item} />)
    expect(await screen.findByText('Split completed successfully')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /split log/i }))
    expect(await screen.findByText('first album line')).toBeInTheDocument()

    previewTitle = 'Second'
    rerender(<AlbumPanel item={{ ...item, path: 'Artist/Second' }} />)

    // The switch collapses the log; reopening it must show the second album's
    // restored entries, never the first album's still-buffered ones.
    expect(await screen.findByText('Second')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /split log/i }))
    expect(await screen.findByText('second album line')).toBeInTheDocument()
    expect(screen.queryByText('first album line')).not.toBeInTheDocument()
  })

  it('ignores a 404 from the restore request and leaves the panel idle', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
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

    expect(await screen.findByText('Split 1 tracks')).toBeInTheDocument()
    expect(screen.getByText('Unsplit')).toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
