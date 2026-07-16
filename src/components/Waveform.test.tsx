import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import type { Track } from '../api/types'
import { BAR_COUNT, fillState } from '../waveform/geometry'
import TrackTable from './TrackTable'
import Waveform from './Waveform'

function track(number: number, startSeconds: number): Track {
  return {
    number,
    title: `Track ${number}`,
    performer: 'Marlow Trio',
    index: '00:00:00',
    start_seconds: startSeconds,
  }
}

// Track 1 starts at 0 and is intentionally cut-less (the prototype labels from 02).
const tracks = [track(1, 0), track(2, 30), track(3, 90)]

describe('Waveform cuts', () => {
  it('draws one cut per non-zero-start track, positioned by its share of the duration', () => {
    const { container } = render(<Waveform variant="idle" tracks={tracks} totalSeconds={120} />)

    const cuts = [...container.querySelectorAll('.cut')]
    expect(cuts).toHaveLength(2)
    expect(cuts.map((c) => (c as HTMLElement).style.left)).toEqual(['25%', '75%'])
    expect(cuts.map((c) => c.querySelector('.cut-num')?.textContent)).toEqual(['02', '03'])
  })

  it('draws no cuts when the duration is unreadable', () => {
    const { container } = render(<Waveform variant="idle" tracks={tracks} totalSeconds={NaN} />)

    expect(container.querySelectorAll('.cut')).toHaveLength(0)
  })

  it('renders both bar layers at the full bar count', () => {
    const { container } = render(<Waveform variant="idle" tracks={tracks} totalSeconds={120} />)

    expect(container.querySelectorAll('.wave-base .wbar')).toHaveLength(BAR_COUNT)
    expect(container.querySelectorAll('.wave-fill .wbar')).toHaveLength(BAR_COUNT)
  })
})

describe('Waveform variants', () => {
  it('leaves the fill empty and the playhead at the left edge when idle', () => {
    const { container } = render(<Waveform variant="idle" tracks={tracks} totalSeconds={120} />)

    expect(container.querySelector('.wave')?.className).toContain('wave--idle')
    const fill = container.querySelector('.wave-fill') as HTMLElement
    expect(fill.style.clipPath).toBe(fillState(0).clipPath)
    expect((container.querySelector('.wave-head') as HTMLElement).style.left).toBe('0%')
  })

  it('clips the fill to the reported progress while active', () => {
    const { container } = render(
      <Waveform variant="active" tracks={tracks} totalSeconds={120} progress={62} />
    )

    expect(container.querySelector('.wave')?.className).toContain('wave--active')
    const fill = container.querySelector('.wave-fill') as HTMLElement
    expect(fill.style.clipPath).toBe(fillState(62).clipPath)
    expect((container.querySelector('.wave-head') as HTMLElement).style.left).toBe('62%')
  })

  it('fills completely on done, ignoring whatever progress the last poll carried', () => {
    const { container } = render(
      <Waveform variant="done" tracks={tracks} totalSeconds={120} progress={13} />
    )

    expect(container.querySelector('.wave')?.className).toContain('wave--done')
    const fill = container.querySelector('.wave-fill') as HTMLElement
    expect(fill.style.clipPath).toBe(fillState(100).clipPath)
    expect((container.querySelector('.wave-head') as HTMLElement).style.left).toBe('100%')
  })
})

describe('Waveform hover', () => {
  it('marks only the cut for the hovered track', () => {
    const { container } = render(
      <Waveform variant="idle" tracks={tracks} totalSeconds={120} hoveredTrack={3} />
    )

    const hovered = container.querySelectorAll('.cut-hover')
    expect(hovered).toHaveLength(1)
    expect(hovered[0].querySelector('.cut-num')?.textContent).toBe('03')
  })

  it('reports hover enter and leave on a cut to the owner', () => {
    const onHoverTrack = vi.fn()
    const { container } = render(
      <Waveform variant="idle" tracks={tracks} totalSeconds={120} onHoverTrack={onHoverTrack} />
    )

    const cut = container.querySelectorAll('.cut')[1]
    fireEvent.mouseEnter(cut)
    expect(onHoverTrack).toHaveBeenLastCalledWith(3)

    fireEvent.mouseLeave(cut)
    expect(onHoverTrack).toHaveBeenLastCalledWith(null)
  })

  it('does not throw when a cut is hovered with no handler wired', () => {
    const { container } = render(<Waveform variant="idle" tracks={tracks} totalSeconds={120} />)

    expect(() => fireEvent.mouseEnter(container.querySelectorAll('.cut')[0])).not.toThrow()
  })
})

describe('TrackTable ↔ Waveform hover linkage', () => {
  // The two components share `hoveredTrack` through AlbumPanel; this drives the
  // real round trip — hovering a table row must light the matching cut, and back.
  it('lights the matching cut when a track row is hovered, and the row when a cut is', () => {
    const { container } = render(<Harness />)

    // Scoped to the table: '03' also labels the cut this assertion is about.
    const table = within(container.querySelector('.ttable') as HTMLElement)
    const row = table.getByText('03').closest('tr')!

    fireEvent.mouseEnter(row)
    expect(container.querySelector('.cut-hover .cut-num')?.textContent).toBe('03')

    fireEvent.mouseLeave(row)
    expect(container.querySelector('.cut-hover')).toBeNull()

    fireEvent.mouseEnter(container.querySelectorAll('.cut')[0])
    expect(container.querySelector('.trow-hover .tn')?.textContent).toBe('02')
  })
})

function Harness() {
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null)
  return (
    <>
      <Waveform
        variant="idle"
        tracks={tracks}
        totalSeconds={120}
        hoveredTrack={hoveredTrack}
        onHoverTrack={setHoveredTrack}
      />
      <TrackTable tracks={tracks} hoveredTrack={hoveredTrack} onHoverTrack={setHoveredTrack} />
    </>
  )
}
