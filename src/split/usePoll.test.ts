import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { JobStatus } from '../api/types'
import { initialPollState, isTerminal, pollReducer, usePoll, type PollState } from './usePoll'

function job(overrides: Partial<JobStatus>): JobStatus {
  return {
    status: 'queued',
    message: '',
    result_files: [],
    progress_current: 0,
    progress_total: 0,
    progress_detail: '',
    log: [],
    log_next: 0,
    ...overrides,
  }
}

describe('pollReducer', () => {
  it('walks queued -> splitting -> tagging -> done, terminal only at done', () => {
    let state: PollState = initialPollState
    expect(isTerminal(state)).toBe(false)

    state = pollReducer(state, { type: 'status', job: job({ status: 'queued' }) })
    expect(state.job?.status).toBe('queued')
    expect(isTerminal(state)).toBe(false)

    state = pollReducer(state, {
      type: 'status',
      job: job({ status: 'splitting', progress_current: 1, progress_total: 4 }),
    })
    expect(state.job?.status).toBe('splitting')
    expect(isTerminal(state)).toBe(false)

    state = pollReducer(state, {
      type: 'status',
      job: job({ status: 'tagging', progress_current: 3, progress_total: 4 }),
    })
    expect(state.job?.status).toBe('tagging')
    expect(isTerminal(state)).toBe(false)

    state = pollReducer(state, {
      type: 'status',
      job: job({
        status: 'done',
        progress_current: 4,
        progress_total: 4,
        result_files: ['01 - Track.flac'],
      }),
    })
    expect(state.job?.status).toBe('done')
    expect(isTerminal(state)).toBe(true)
  })

  it('reaches a terminal error status from job status: error', () => {
    let state: PollState = initialPollState
    state = pollReducer(state, { type: 'status', job: job({ status: 'splitting' }) })
    expect(isTerminal(state)).toBe(false)

    state = pollReducer(state, {
      type: 'status',
      job: job({ status: 'error', message: 'shnsplit failed' }),
    })
    expect(state.job?.status).toBe('error')
    expect(state.job?.message).toBe('shnsplit failed')
    expect(isTerminal(state)).toBe(true)
  })

  it('is terminal on a fetch-level error even without a job status', () => {
    let state: PollState = initialPollState
    state = pollReducer(state, { type: 'fetchError', message: 'network down' })
    expect(state.fetchError).toBe('network down')
    expect(isTerminal(state)).toBe(true)
  })

  it('clears a prior fetch error once a status arrives, and reset clears everything', () => {
    let state: PollState = initialPollState
    state = pollReducer(state, { type: 'fetchError', message: 'timeout' })
    expect(isTerminal(state)).toBe(true)

    state = pollReducer(state, { type: 'status', job: job({ status: 'splitting' }) })
    expect(state.fetchError).toBeNull()
    expect(isTerminal(state)).toBe(false)

    state = pollReducer(state, { type: 'reset' })
    expect(state).toEqual(initialPollState)
  })

  it('appends log entries across ticks and advances the cursor', () => {
    let state: PollState = initialPollState
    state = pollReducer(state, {
      type: 'status',
      job: job({
        status: 'splitting',
        log: [{ seq: 0, time: 't0', level: 'info', text: 'cue parsed' }],
        log_next: 1,
      }),
    })
    expect(state.log).toEqual([{ seq: 0, time: 't0', level: 'info', text: 'cue parsed' }])
    expect(state.logNext).toBe(1)

    state = pollReducer(state, {
      type: 'status',
      job: job({
        status: 'splitting',
        log: [{ seq: 1, time: 't1', level: 'info', text: 'track 01/04' }],
        log_next: 2,
      }),
    })
    expect(state.log).toEqual([
      { seq: 0, time: 't0', level: 'info', text: 'cue parsed' },
      { seq: 1, time: 't1', level: 'info', text: 'track 01/04' },
    ])
    expect(state.logNext).toBe(2)
  })

  it('keeps the cursor and log unchanged when a tick brings back no new entries', () => {
    let state: PollState = initialPollState
    state = pollReducer(state, {
      type: 'status',
      job: job({
        status: 'splitting',
        log: [{ seq: 0, time: 't0', level: 'info', text: 'cue parsed' }],
        log_next: 1,
      }),
    })

    state = pollReducer(state, {
      type: 'status',
      job: job({ status: 'splitting', log: [], log_next: 1 }),
    })
    expect(state.log).toEqual([{ seq: 0, time: 't0', level: 'info', text: 'cue parsed' }])
    expect(state.logNext).toBe(1)
  })

  it('reset clears the accumulated log and cursor along with everything else', () => {
    let state: PollState = initialPollState
    state = pollReducer(state, {
      type: 'status',
      job: job({
        status: 'done',
        log: [{ seq: 0, time: 't0', level: 'info', text: 'done: 4 files' }],
        log_next: 1,
      }),
    })
    state = pollReducer(state, { type: 'reset' })
    expect(state).toEqual(initialPollState)
  })
})

function jobResponse(body: JobStatus): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const idle = () => new Promise((resolve) => setTimeout(resolve, 40))

describe('usePoll hook', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('polls repeatedly while active and stops once the job is done', async () => {
    const statuses: JobStatus['status'][] = ['splitting', 'splitting', 'done']
    let i = 0
    const fetchMock = vi.fn(() => {
      const status = statuses[Math.min(i, statuses.length - 1)]
      i += 1
      return Promise.resolve(jobResponse(job({ status })))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePoll('Artist/Album/album.cue', 0, 10))

    await waitFor(() => expect(result.current.job?.status).toBe('done'))
    const callsAtDone = fetchMock.mock.calls.length
    expect(callsAtDone).toBeGreaterThanOrEqual(3)

    await idle()
    expect(fetchMock.mock.calls.length).toBe(callsAtDone) // no polling after terminal
  })

  it('restarts polling when runToken changes even though jobId is unchanged', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jobResponse(job({ status: 'done' }))))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ jobId, runToken }) => usePoll(jobId, runToken, 10), {
      initialProps: { jobId: 'Artist/Album/album.cue', runToken: 0 },
    })

    await waitFor(() => expect(result.current.job?.status).toBe('done'))
    const callsAfterFirst = fetchMock.mock.calls.length

    // A split-again returns the same deterministic jobId; only runToken changes.
    rerender({ jobId: 'Artist/Album/album.cue', runToken: 1 })

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst))
    await waitFor(() => expect(result.current.job?.status).toBe('done'))
  })

  it('records a fetch-level error and stops polling', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('boom', { status: 500 })))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePoll('Artist/Album/album.cue', 0, 10))

    await waitFor(() => expect(result.current.fetchError).not.toBeNull())
    const callsAtError = fetchMock.mock.calls.length

    await idle()
    expect(fetchMock.mock.calls.length).toBe(callsAtError) // no polling after fetch error
  })

  it('reports every step of queued -> splitting -> tagging -> done with its progress', async () => {
    const steps: JobStatus[] = [
      job({ status: 'queued', progress_total: 4 }),
      job({ status: 'splitting', progress_current: 1, progress_total: 4 }),
      job({ status: 'tagging', progress_current: 3, progress_total: 4 }),
      job({ status: 'done', progress_current: 4, progress_total: 4 }),
    ]
    let i = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const body = steps[Math.min(i, steps.length - 1)]
        i += 1
        return Promise.resolve(jobResponse(body))
      })
    )

    // Sample on every render rather than through waitFor, which polls and would
    // miss the intermediate statuses this test exists to pin.
    const seen: string[] = []
    const { result } = renderHook(() => {
      const state = usePoll('Artist/Album/album.cue', 0, 10)
      if (state.job) {
        const step = `${state.job.status} ${state.job.progress_current}/${state.job.progress_total}`
        if (seen[seen.length - 1] !== step) seen.push(step)
      }
      return state
    })

    await waitFor(() => expect(result.current.job?.status).toBe('done'))
    expect(seen).toEqual(['queued 0/4', 'splitting 1/4', 'tagging 3/4', 'done 4/4'])
  })

  it('stops polling on unmount', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jobResponse(job({ status: 'splitting' }))))
    vi.stubGlobal('fetch', fetchMock)

    const { result, unmount } = renderHook(() => usePoll('Artist/Album/album.cue', 0, 10))

    await waitFor(() => expect(result.current.job?.status).toBe('splitting'))
    unmount()
    const callsAtUnmount = fetchMock.mock.calls.length

    await idle()
    // An interval surviving unmount would leak a request every intervalMs.
    expect(fetchMock.mock.calls.length).toBe(callsAtUnmount)
  })

  it('discards an in-flight response from a job it has already moved off', async () => {
    // The first job's request hangs; the second's answers immediately. Releasing the
    // stale one afterwards must not clobber the current job's state — this is the
    // `cancelled` guard, and it is the one route by which the guard is observable:
    // after an *unmount* React silently drops the dispatch either way, so the same
    // scenario there would pass with the guard deleted.
    let releaseStale: () => void = () => {}
    const stale = new Promise<Response>((resolve) => {
      releaseStale = () => resolve(jobResponse(job({ status: 'error', message: 'stale' })))
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('first')
          ? stale
          : Promise.resolve(jobResponse(job({ status: 'done' })))
      )
    )

    const { result, rerender } = renderHook(({ jobId }) => usePoll(jobId, 0, 10), {
      initialProps: { jobId: 'first' },
    })

    rerender({ jobId: 'second' })
    await waitFor(() => expect(result.current.job?.status).toBe('done'))

    releaseStale()
    await stale
    await idle()

    expect(result.current.job?.status).toBe('done')
    expect(result.current.job?.message).toBe('')
  })

  it('resets to the initial state and issues no request when jobId becomes null', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jobResponse(job({ status: 'done' }))))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ jobId }) => usePoll(jobId, 0, 10), {
      initialProps: { jobId: 'Artist/Album/album.cue' as string | null },
    })

    await waitFor(() => expect(result.current.job?.status).toBe('done'))
    const callsBeforeClear = fetchMock.mock.calls.length

    rerender({ jobId: null })
    expect(result.current).toEqual(initialPollState)

    await idle()
    expect(fetchMock.mock.calls.length).toBe(callsBeforeClear)
  })

  it('requests the current log cursor on every tick', async () => {
    const responses: JobStatus[] = [
      job({
        status: 'splitting',
        log: [{ seq: 0, time: 't0', level: 'info', text: 'a' }],
        log_next: 1,
      }),
      job({
        status: 'splitting',
        log: [{ seq: 1, time: 't1', level: 'info', text: 'b' }],
        log_next: 3,
      }),
      job({ status: 'done', log: [], log_next: 3 }),
    ]
    let i = 0
    const fetchMock = vi.fn(() => {
      const body = responses[Math.min(i, responses.length - 1)]
      i += 1
      return Promise.resolve(jobResponse(body))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePoll('Artist/Album/album.cue', 0, 10))
    await waitFor(() => expect(result.current.job?.status).toBe('done'))

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls[0]).not.toContain('log_since')
    expect(urls[1]).toContain('log_since=1')
    expect(urls[2]).toContain('log_since=3')
    expect(result.current.log.map((e) => e.text)).toEqual(['a', 'b'])
  })

  it('restarts polling and the accumulated log from empty when runToken changes', async () => {
    let call = 0
    const fetchMock = vi.fn(() => {
      call += 1
      if (call === 1) {
        return Promise.resolve(
          jobResponse(
            job({
              status: 'done',
              log: [{ seq: 0, time: 't0', level: 'info', text: 'first run' }],
              log_next: 1,
            })
          )
        )
      }
      return Promise.resolve(
        jobResponse(
          job({
            status: 'done',
            log: [{ seq: 0, time: 't0', level: 'info', text: 'second run' }],
            log_next: 1,
          })
        )
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ jobId, runToken }) => usePoll(jobId, runToken, 10), {
      initialProps: { jobId: 'Artist/Album/album.cue', runToken: 0 },
    })

    await waitFor(() => expect(result.current.job?.status).toBe('done'))
    expect(result.current.log.map((e) => e.text)).toEqual(['first run'])

    rerender({ jobId: 'Artist/Album/album.cue', runToken: 1 })
    expect(result.current.log).toEqual([])

    await waitFor(() => expect(result.current.log.map((e) => e.text)).toEqual(['second run']))
    const secondRunUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0])
    expect(secondRunUrl).not.toContain('log_since')
  })

  it('does not start a second request while one is in flight, and appends no entry twice', async () => {
    let releaseFirst: (() => void) | null = null
    const first = new Promise<Response>((resolve) => {
      releaseFirst = () =>
        resolve(
          jobResponse(
            job({
              status: 'splitting',
              log: [{ seq: 0, time: 't0', level: 'info', text: 'slow tick' }],
              log_next: 1,
            })
          )
        )
    })
    let call = 0
    const fetchMock = vi.fn(() => {
      call += 1
      if (call === 1) return first
      return Promise.resolve(jobResponse(job({ status: 'done', log: [], log_next: 1 })))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePoll('Artist/Album/album.cue', 0, 10))

    // Several intervals' worth of wall-clock time pass while the first request hangs.
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(fetchMock.mock.calls.length).toBe(1)
    expect(result.current.log).toEqual([])

    releaseFirst?.()
    await waitFor(() => expect(result.current.log).toHaveLength(1))
    await waitFor(() => expect(result.current.job?.status).toBe('done'))

    await idle()
    expect(result.current.log).toEqual([{ seq: 0, time: 't0', level: 'info', text: 'slow tick' }])
  })
})
