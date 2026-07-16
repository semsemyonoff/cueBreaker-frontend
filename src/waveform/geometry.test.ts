import { describe, expect, it } from 'vitest'
import type { Track } from '../api/types'
import { BAR_COUNT, barHeights, cutPositions, fillState, formatDuration } from './geometry'

function track(number: number, start_seconds: number): Track {
  return { number, title: `Track ${number}`, performer: '', index: '00:00:00', start_seconds }
}

describe('barHeights', () => {
  // Pinned to the literal: every other assertion here compares against the
  // constant itself, so a change to it would otherwise pass the whole suite.
  it('draws the prototype’s 72 bars per layer', () => {
    expect(BAR_COUNT).toBe(72)
  })

  it('returns BAR_COUNT heights by default, each within 1-10', () => {
    const heights = barHeights()
    expect(heights).toHaveLength(BAR_COUNT)
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(1)
      expect(h).toBeLessThanOrEqual(10)
    }
  })

  it('is deterministic across calls', () => {
    expect(barHeights()).toEqual(barHeights())
  })

  it('respects a custom count', () => {
    expect(barHeights(5)).toHaveLength(5)
  })
})

describe('cutPositions', () => {
  it('maps start_seconds/total_seconds to left%, skipping track 1 at 0', () => {
    const tracks = [track(1, 0), track(2, 10), track(3, 50), track(4, 90)]

    expect(cutPositions(tracks, 100)).toEqual([
      { trackNumber: 2, leftPercent: 10 },
      { trackNumber: 3, leftPercent: 50 },
      { trackNumber: 4, leftPercent: 90 },
    ])
  })

  it('clamps a start_seconds beyond total_seconds to 100%', () => {
    const tracks = [track(1, 0), track(2, 150)]

    expect(cutPositions(tracks, 100)).toEqual([{ trackNumber: 2, leftPercent: 100 }])
  })

  it('returns no cut-lines when total_seconds is unreadable (<= 0)', () => {
    const tracks = [track(1, 0), track(2, 10), track(3, 50)]

    expect(cutPositions(tracks, 0)).toEqual([])
    expect(cutPositions(tracks, -5)).toEqual([])
  })

  it('returns no cut-lines when total_seconds is non-finite', () => {
    const tracks = [track(1, 0), track(2, 10), track(3, 50)]

    expect(cutPositions(tracks, NaN)).toEqual([])
    expect(cutPositions(tracks, Infinity)).toEqual([])
    expect(cutPositions(tracks, -Infinity)).toEqual([])
  })

  it('skips a track whose own start_seconds is non-finite', () => {
    expect(cutPositions([track(2, NaN)], 100)).toEqual([])
    expect(cutPositions([track(1, 0), track(2, NaN), track(3, 50)], 100)).toEqual([
      { trackNumber: 3, leftPercent: 50 },
    ])
  })

  it('never emits a non-finite leftPercent', () => {
    const tracks = [track(2, Infinity), track(3, 25)]

    for (const cut of cutPositions(tracks, 100)) {
      expect(Number.isFinite(cut.leftPercent)).toBe(true)
    }
  })

  it('returns no cut-lines for a single unsplit track', () => {
    expect(cutPositions([track(1, 0)], 100)).toEqual([])
  })
})

describe('fillState', () => {
  it('derives clip-path and playhead position from progress', () => {
    expect(fillState(62)).toEqual({
      fillPercent: 62,
      clipPath: 'inset(0 38% 0 0)',
      playheadLeft: '62%',
    })
  })

  it('clamps progress below 0 and above 100', () => {
    expect(fillState(-10).fillPercent).toBe(0)
    expect(fillState(150).fillPercent).toBe(100)
  })

  it('collapses a NaN progress to 0 rather than emitting NaN%', () => {
    expect(fillState(NaN)).toEqual({
      fillPercent: 0,
      clipPath: 'inset(0 100% 0 0)',
      playheadLeft: '0%',
    })
  })

  it('clamps an infinite progress to the 0-100 bounds', () => {
    expect(fillState(Infinity).fillPercent).toBe(100)
    expect(fillState(-Infinity).fillPercent).toBe(0)
  })

  it('fully reveals the fill layer and parks the playhead at 100 when done', () => {
    expect(fillState(100)).toEqual({
      fillPercent: 100,
      clipPath: 'inset(0 0% 0 0)',
      playheadLeft: '100%',
    })
  })
})

describe('formatDuration', () => {
  it('renders MM:SS zero-padded', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(9)).toBe('00:09')
    expect(formatDuration(64)).toBe('01:04')
  })

  it('rolls hours into minutes rather than emitting an HH field', () => {
    expect(formatDuration(3684)).toBe('61:24')
    expect(formatDuration(3600)).toBe('60:00')
  })

  it('truncates fractional seconds instead of rounding up past the duration', () => {
    expect(formatDuration(59.9)).toBe('00:59')
  })

  it('renders an unreadable duration as --:-- rather than a fabricated 00:00', () => {
    expect(formatDuration(NaN)).toBe('--:--')
    expect(formatDuration(Infinity)).toBe('--:--')
    expect(formatDuration(-1)).toBe('--:--')
  })
})
