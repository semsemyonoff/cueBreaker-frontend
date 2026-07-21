import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, coverUrl, preview, scan, search, split, status, version } from './client'

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('scan', () => {
  it('GETs /api/scan and returns the parsed result', async () => {
    const result_ = {
      items: [
        {
          path: 'Artist/Album',
          abs_path: '/input/Artist/Album',
          cue_files: ['album.cue'],
          flac_files: ['album.flac'],
          split_done: false,
          output_tracks: 0,
        },
      ],
      log: [{ seq: 1, time: '2026-07-20T14:03:22Z', level: 'warn', text: 'skip Foo — bad' }],
      summary: { dirs_walked: 1, albums: 1, unsplit: 1, skipped: 0, elapsed_ms: 5 },
    }
    const fetchMock = mockFetch(jsonResponse(result_))

    const result = await scan()

    expect(fetchMock).toHaveBeenCalledWith('/api/scan', undefined)
    expect(result).toEqual(result_)
  })

  it('throws ApiError with the server message on failure', async () => {
    mockFetch(jsonResponse({ error: 'boom' }, { status: 500, statusText: 'Internal Server Error' }))

    await expect(scan()).rejects.toMatchObject(new ApiError(500, 'boom'))
  })

  it('falls back to statusText when the error body is not JSON', async () => {
    mockFetch(new Response('not json', { status: 502, statusText: 'Bad Gateway' }))

    await expect(scan()).rejects.toMatchObject(new ApiError(502, 'Bad Gateway'))
  })

  it('falls back to statusText when the error body is JSON without an error field', async () => {
    mockFetch(
      jsonResponse({ detail: 'nope' }, { status: 500, statusText: 'Internal Server Error' })
    )

    await expect(scan()).rejects.toMatchObject(new ApiError(500, 'Internal Server Error'))
  })

  it('reports the status code when statusText is empty', async () => {
    // fetch/undici leaves statusText '' for a code it has no canonical phrase for,
    // which would otherwise throw an ApiError with an empty message.
    mockFetch(new Response('not json', { status: 599, statusText: '' }))

    await expect(scan()).rejects.toMatchObject(new ApiError(599, 'request failed with status 599'))
  })

  it('rejects when a 2xx body is not valid JSON', async () => {
    mockFetch(new Response('<html>proxy error</html>', { status: 200 }))

    // Matched on type: a bare toThrow() passes on any rejection, including an
    // ApiError from a misread status — the opposite of what this pins.
    await expect(scan()).rejects.toThrow(SyntaxError)
  })
})

describe('search', () => {
  it('URL-encodes the query string', async () => {
    const fetchMock = mockFetch(jsonResponse([]))

    await search("O'Brien & Sons")

    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=O'Brien%20%26%20Sons", undefined)
  })
})

describe('preview', () => {
  it('POSTs path and cue_file as JSON', async () => {
    const body = {
      performer: 'Artist',
      title: 'Album',
      file: 'album.flac',
      genre: '',
      date: '',
      tracks: [{ number: 1, title: 'T1', performer: '', index: '00:00:00', start_seconds: 0 }],
      has_cover: true,
      cover_name: 'cover.jpg',
      split_done: false,
      output_tracks: 0,
      total_seconds: 3684,
    }
    const fetchMock = mockFetch(jsonResponse(body))

    const result = await preview("Artist's Album", 'album.cue')

    expect(fetchMock).toHaveBeenCalledWith('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: "Artist's Album", cue_file: 'album.cue' }),
    })
    expect(result).toEqual(body)
  })
})

describe('split', () => {
  it('POSTs and returns the accepted job', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ job_id: 'Artist/Album/album.cue', status: 'queued' }, { status: 202 })
    )

    const result = await split('Artist/Album', 'album.cue')

    expect(fetchMock).toHaveBeenCalledWith('/api/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'Artist/Album', cue_file: 'album.cue' }),
    })
    expect(result).toEqual({ job_id: 'Artist/Album/album.cue', status: 'queued' })
  })

  it('throws ApiError on a 409 conflict', async () => {
    mockFetch(
      jsonResponse(
        { error: 'Already in progress', job_id: 'Artist/Album/album.cue' },
        { status: 409, statusText: 'Conflict' }
      )
    )

    await expect(split('Artist/Album', 'album.cue')).rejects.toMatchObject(
      new ApiError(409, 'Already in progress')
    )
  })
})

describe('status', () => {
  it('GETs the job status by id, encoding unsafe characters', async () => {
    const jobStatus = {
      status: 'splitting',
      message: '',
      result_files: [],
      progress_current: 1,
      progress_total: 4,
      progress_detail: 'track 1',
      log: [],
      log_next: 0,
    }
    const fetchMock = mockFetch(jsonResponse(jobStatus))

    const result = await status("Artist's Album/album.cue")

    expect(fetchMock).toHaveBeenCalledWith("/api/status/Artist's%20Album/album.cue", undefined)
    expect(result).toEqual(jobStatus)
  })

  it('omits log_since from the query string when since is not given', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        status: 'queued',
        message: '',
        result_files: [],
        progress_current: 0,
        progress_total: 0,
        progress_detail: '',
        log: [],
        log_next: 0,
      })
    )

    await status('Artist/Album/album.cue')

    expect(fetchMock).toHaveBeenCalledWith('/api/status/Artist/Album/album.cue', undefined)
  })

  it('appends log_since when since is non-zero', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        status: 'queued',
        message: '',
        result_files: [],
        progress_current: 0,
        progress_total: 0,
        progress_detail: '',
        log: [],
        log_next: 0,
      })
    )

    await status('Artist/Album/album.cue', 42)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/status/Artist/Album/album.cue?log_since=42',
      undefined
    )
  })
})

describe('version', () => {
  it('GETs /api/version', async () => {
    const fetchMock = mockFetch(jsonResponse({ version: '1.2.3' }))

    const result = await version()

    expect(fetchMock).toHaveBeenCalledWith('/api/version', undefined)
    expect(result).toEqual({ version: '1.2.3' })
  })
})

describe('coverUrl', () => {
  it('builds a plain path unchanged', () => {
    expect(coverUrl('Artist/Album')).toBe('/api/cover/Artist/Album')
  })

  it('encodes apostrophes and other unsafe characters per segment', () => {
    expect(coverUrl("Artist's Band/Album #1")).toBe("/api/cover/Artist's%20Band/Album%20%231")
  })

  it('keeps slashes as directory separators', () => {
    expect(coverUrl('A/B/C')).toBe('/api/cover/A/B/C')
  })
})
