import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Track } from '../api/types'
import TrackTable from './TrackTable'

function track(number: number, overrides: Partial<Track> = {}): Track {
  return {
    number,
    title: `Track ${number}`,
    performer: 'Marlow Trio',
    index: '00:00:00',
    start_seconds: 0,
    ...overrides,
  }
}

describe('TrackTable', () => {
  it('renders one row per track with a zero-padded number', () => {
    render(
      <TrackTable
        tracks={[track(1), track(2, { index: '02:00:00', start_seconds: 120 })]}
        hoveredTrack={null}
        onHoverTrack={() => {}}
      />
    )

    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 tracks
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
    expect(screen.getByText('02:00:00')).toBeInTheDocument()
  })

  it('renders an empty body rather than failing when the album has no tracks', () => {
    render(<TrackTable tracks={[]} hoveredTrack={null} onHoverTrack={() => {}} />)

    expect(screen.getAllByRole('row')).toHaveLength(1) // header only
  })

  it('reports hover enter and leave to the owner', () => {
    const onHoverTrack = vi.fn()
    render(
      <TrackTable tracks={[track(1), track(2)]} hoveredTrack={null} onHoverTrack={onHoverTrack} />
    )

    const row = screen.getByText('02').closest('tr')!
    fireEvent.mouseEnter(row)
    expect(onHoverTrack).toHaveBeenLastCalledWith(2)

    fireEvent.mouseLeave(row)
    expect(onHoverTrack).toHaveBeenLastCalledWith(null)
  })

  it('marks only the hovered row', () => {
    const { container } = render(
      <TrackTable tracks={[track(1), track(2)]} hoveredTrack={2} onHoverTrack={() => {}} />
    )

    const hovered = container.querySelectorAll('.trow-hover')
    expect(hovered).toHaveLength(1)
    expect(hovered[0].querySelector('.tn')?.textContent).toBe('02')
  })
})
