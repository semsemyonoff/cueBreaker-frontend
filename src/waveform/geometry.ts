import type { Track } from '../api/types'

/** Number of synthetic bars drawn across the waveform (matches the prototype). */
export const BAR_COUNT = 68

const MIN_BAR_HEIGHT = 1
const MAX_BAR_HEIGHT = 10

/**
 * Deterministic synthetic bar heights (1-10, mapped to CSS classes `h1`..`h10`).
 * There's no real decoded audio in Phase 1 — the waveform is decorative — but the
 * heights must be stable across renders/tests, so this uses a fixed-seed LCG
 * instead of `Math.random()`.
 */
export function barHeights(count: number = BAR_COUNT): number[] {
  const heights: number[] = []
  let seed = 0
  for (let i = 0; i < count; i++) {
    seed = (seed * 9301 + 49297) % 233280
    const rand = seed / 233280
    heights.push(MIN_BAR_HEIGHT + Math.floor(rand * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT + 1)))
  }
  return heights
}

export interface CutPosition {
  trackNumber: number
  leftPercent: number
}

/** NaN survives Math.min/max, so it is folded to 0 before clamping; ±Infinity clamps normally. */
function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/**
 * Cut-line positions (`left%`) for tracks with a real `start_seconds > 0`.
 * Track 1 always starts at 0 and is intentionally skipped (the prototype
 * labels cuts from `02`); an unreadable `totalSeconds` — non-finite, or
 * `<= 0` — yields no cut-lines at all rather than bunching everything at the
 * left edge. A track whose own `start_seconds` is unreadable is skipped the
 * same way.
 */
export function cutPositions(tracks: Track[], totalSeconds: number): CutPosition[] {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return []

  const positions: CutPosition[] = []
  for (const track of tracks) {
    if (!Number.isFinite(track.start_seconds) || track.start_seconds <= 0) continue
    positions.push({
      trackNumber: track.number,
      leftPercent: clampPercent((track.start_seconds / totalSeconds) * 100),
    })
  }
  return positions
}

/**
 * Seconds → `MM:SS`, hours rolling into minutes (the prototype writes a 61-minute
 * album as `61:24`, not `1:01:24`). The prototype's `61:24:00` is MM:SS:FF, but
 * `total_seconds` carries no frame data, so the frames field would have to be
 * fabricated — we render MM:SS instead. A duration we cannot read — non-finite or
 * negative — renders as `--:--` rather than a plausible-looking `00:00`.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export interface FillState {
  /** Progress clamped to 0-100. */
  fillPercent: number
  /** `clip-path` for the `.wave-fill` layer. */
  clipPath: string
  /** CSS `left` for the playhead. */
  playheadLeft: string
}

/**
 * Derives the fill clip-path + playhead position for a given progress percent.
 * A `NaN` progress collapses to 0 rather than emitting `NaN%`.
 */
export function fillState(progress: number): FillState {
  const fillPercent = clampPercent(progress)
  return {
    fillPercent,
    clipPath: `inset(0 ${100 - fillPercent}% 0 0)`,
    playheadLeft: `${fillPercent}%`,
  }
}
