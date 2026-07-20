import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { LogEntry } from '../api/types'
import LogPanel from './LogPanel'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    seq: 1,
    time: '2026-07-20T14:03:22Z',
    level: 'info',
    text: 'cue parsed: 14 tracks',
    ...overrides,
  }
}

describe('LogPanel collapse state', () => {
  it('does not render the body while collapsed', () => {
    const { container } = render(
      <LogPanel entries={[entry()]} label="Split log" open={false} onToggle={vi.fn()} />
    )

    expect(container.querySelector('.lbody')).toBeNull()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders the body and tracks aria-expanded while open', () => {
    const { container } = render(
      <LogPanel entries={[entry()]} label="Split log" open={true} onToggle={vi.fn()} />
    )

    expect(container.querySelector('.lbody')).not.toBeNull()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('calls onToggle with the flipped state when the header is clicked', () => {
    const onToggle = vi.fn()
    render(<LogPanel entries={[]} label="Split log" open={false} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledWith(true)

    onToggle.mockClear()
    render(<LogPanel entries={[]} label="Split log" open={true} onToggle={onToggle} />)
    fireEvent.click(screen.getAllByRole('button')[1])
    expect(onToggle).toHaveBeenCalledWith(false)
  })
})

describe('LogPanel entry rendering', () => {
  it('shows an explicit empty state when open with no entries', () => {
    render(<LogPanel entries={[]} label="Scan log" open={true} onToggle={vi.fn()} />)

    expect(screen.getByText(/no log entries/i)).toBeInTheDocument()
  })

  it('applies a level class per entry', () => {
    const { container } = render(
      <LogPanel
        entries={[
          entry({ seq: 1, level: 'info' }),
          entry({ seq: 2, level: 'warn' }),
          entry({ seq: 3, level: 'error' }),
        ]}
        label="Split log"
        open={true}
        onToggle={vi.fn()}
      />
    )

    const items = container.querySelectorAll('.lbody li')
    expect(items[0].className).toBe('ll')
    expect(items[1].className).toBe('ll ll-warn')
    expect(items[2].className).toBe('ll ll-err')
  })

  it('formats the timestamp as local HH:MM:SS', () => {
    const withTime = entry({ time: '2026-07-20T14:03:22Z' })
    render(<LogPanel entries={[withTime]} label="Split log" open={true} onToggle={vi.fn()} />)

    const expected = new Date(withTime.time)
    const pad = (n: number) => String(n).padStart(2, '0')
    const text = `${pad(expected.getHours())}:${pad(expected.getMinutes())}:${pad(expected.getSeconds())}`

    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('renders a right-aligned summary node', () => {
    render(
      <LogPanel
        entries={[]}
        label="Scan log"
        summary="118 albums · 6 skipped"
        open={true}
        onToggle={vi.fn()}
      />
    )

    expect(screen.getByText('118 albums · 6 skipped')).toBeInTheDocument()
  })
})
