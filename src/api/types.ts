// Domain types mirroring the Go backend's JSON wire shapes
// (backend/internal/scan, backend/internal/cue, backend/internal/job,
// backend/internal/server/handlers.go).

/** One scanned album directory, as returned by GET /api/scan and /api/search. */
export interface ScanPair {
  path: string
  abs_path: string
  cue_files: string[]
  flac_files: string[]
  split_done: boolean
  output_tracks: number
}

/** One CUE track entry, with both the raw INDEX string and its numeric offset. */
export interface Track {
  number: number
  title: string
  performer: string
  index: string
  start_seconds: number
}

/** POST /api/preview response: parsed CUE album plus cover/status/duration data. */
export interface Preview {
  performer: string
  title: string
  file: string
  genre: string
  date: string
  tracks: Track[]
  has_cover: boolean
  cover_name?: string
  split_done: boolean
  output_tracks: number
  total_seconds: number
}

export type JobStatusValue = 'queued' | 'splitting' | 'tagging' | 'done' | 'error'

/** Statuses a job is still running in — i.e. every value that is not terminal (`done`/`error`). */
export const ACTIVE_STATUSES: ReadonlySet<JobStatusValue> = new Set<JobStatusValue>([
  'queued',
  'splitting',
  'tagging',
])

/**
 * The ambient summary of a running split. Job state itself stays in AlbumPanel
 * (moving `usePoll` up would restart polling on unrelated re-renders and break
 * its `runToken` restart semantics); this is the slice the topbar and tree need.
 */
export interface ActiveJob {
  path: string
  status: JobStatusValue
  progressCurrent: number
  progressTotal: number
}

/**
 * Percent complete for a job, 0 while its total is not yet known, clamped to
 * 0-100. The counts are derived from `shnsplit`'s stderr, so `current` can
 * overshoot `total` (a pregap/hidden track); every caller renders this directly,
 * and `105%` in the tree is worse than a pinned `100%`.
 */
export function progressPercent(current: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (current / total) * 100))
}

/** GET /api/status/{job_id} response. */
export interface JobStatus {
  status: JobStatusValue
  message: string
  result_files: string[]
  progress_current: number
  progress_total: number
  progress_detail: string
}

/** POST /api/split success response (202 Accepted). */
export interface SplitAccepted {
  job_id: string
  status: string
}

/** GET /api/version response. */
export interface Version {
  version: string
  /** The installed shntool's version; absent when the backend could not determine it. */
  shntool_version?: string
}
