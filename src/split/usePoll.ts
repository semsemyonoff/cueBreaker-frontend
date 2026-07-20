import { useEffect, useReducer } from 'react'
import * as api from '../api/client'
import type { JobStatus, LogEntry } from '../api/types'

/**
 * Poll state: the last-seen job status, a fetch-level error distinct from a
 * job `status: 'error'`, and the split log accumulated across ticks.
 */
export interface PollState {
  job: JobStatus | null
  fetchError: string | null
  log: LogEntry[]
}

export const initialPollState: PollState = { job: null, fetchError: null, log: [] }

export type PollAction =
  { type: 'reset' } | { type: 'status'; job: JobStatus } | { type: 'fetchError'; message: string }

export function pollReducer(state: PollState, action: PollAction): PollState {
  switch (action.type) {
    case 'reset':
      return initialPollState
    case 'status':
      return {
        job: action.job,
        fetchError: null,
        log: action.job.log.length ? [...state.log, ...action.job.log] : state.log,
      }
    case 'fetchError':
      return { ...state, fetchError: action.message }
  }
}

/** True once polling has reached a state it will not advance from on its own. */
export function isTerminal(state: PollState): boolean {
  return state.fetchError !== null || state.job?.status === 'done' || state.job?.status === 'error'
}

/**
 * Polls `GET /api/status/{jobId}` every `intervalMs` while `jobId` is set,
 * stopping once the job reaches a terminal status (`done`/`error`) or a
 * fetch fails. Resets to `initialPollState` whenever `jobId` changes, or
 * whenever `runToken` changes — bump `runToken` to restart polling for a
 * re-run whose job ID is identical (split-again / retry), which React would
 * otherwise treat as a no-op state update.
 *
 * Requests are chained via `setTimeout`, not `setInterval`: only one status
 * request is ever in flight, so a request slower than `intervalMs` cannot
 * overlap the next one and corrupt the incremental log cursor (two ticks
 * reading the same cursor would append the same entries twice while
 * dragging it backwards). The cursor itself lives in a plain closure
 * variable, not component state, so a new log line never restarts this
 * effect — it resets to 0 whenever the effect itself re-runs.
 */
export function usePoll(jobId: string | null, runToken = 0, intervalMs = 500): PollState {
  const [state, dispatch] = useReducer(pollReducer, initialPollState)

  useEffect(() => {
    dispatch({ type: 'reset' })
    if (!jobId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let cursor = 0

    async function tick() {
      try {
        const job = await api.status(jobId as string, cursor)
        if (cancelled) return
        cursor = job.log_next
        dispatch({ type: 'status', job })
        if (job.status !== 'done' && job.status !== 'error') {
          timer = setTimeout(tick, intervalMs)
        }
      } catch (err) {
        if (cancelled) return
        dispatch({ type: 'fetchError', message: err instanceof Error ? err.message : String(err) })
      }
    }

    void tick()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [jobId, runToken, intervalMs])

  return state
}
