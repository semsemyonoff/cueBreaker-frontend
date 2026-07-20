import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { LogEntry, ScanPair } from '../api/types'
import { saveOpenPaths } from '../tree/buildTree'
import Sidebar from './Sidebar'

beforeEach(() => {
  // Tree persists its open folders; a leaked set would decide what a search shows.
  window.localStorage.clear()
})

function pair(path: string): ScanPair {
  return {
    path,
    abs_path: `/input/${path}`,
    cue_files: ['album.cue'],
    flac_files: ['album.flac'],
    split_done: false,
    output_tracks: 0,
  }
}

const items = [
  pair('Lossless/Marlow Trio/Blue Meridian'),
  pair('Lossless/Marlow Trio/Night Ferry'),
  pair('Lossless/Vela Quartet/Solar Drift'),
]

/**
 * Filtering prunes the tree but does not open it — a collapsed folder hides its
 * matches either way. Seeding every folder open is what makes the pruning
 * observable as album rows rather than only as folder counts.
 */
function openAllFolders() {
  saveOpenPaths(new Set(['Lossless', 'Lossless/Marlow Trio', 'Lossless/Vela Quartet']))
}

function renderSidebar(props: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const onSelect = vi.fn()
  const onRescan = vi.fn()
  const result = render(
    <Sidebar items={items} selectedPath={null} onSelect={onSelect} onRescan={onRescan} {...props} />
  )
  return { ...result, onSelect, onRescan }
}

function search(value: string) {
  fireEvent.change(screen.getByLabelText('Search library'), { target: { value } })
}

describe('Sidebar search', () => {
  it('prunes the tree to matching albums and restores it when cleared', () => {
    openAllFolders()
    renderSidebar()

    expect(screen.getByText('Blue Meridian')).toBeInTheDocument()
    expect(screen.getByText('Night Ferry')).toBeInTheDocument()
    expect(screen.getByText('Solar Drift')).toBeInTheDocument()

    search('ferry')

    expect(screen.getByText('Night Ferry')).toBeInTheDocument()
    expect(screen.queryByText('Blue Meridian')).toBeNull()
    expect(screen.queryByText('Solar Drift')).toBeNull()
    expect(screen.queryByText('Vela Quartet')).toBeNull()

    search('')

    expect(screen.getByText('Blue Meridian')).toBeInTheDocument()
    expect(screen.getByText('Solar Drift')).toBeInTheDocument()
  })

  it('is case-insensitive and ignores surrounding whitespace', () => {
    openAllFolders()
    renderSidebar()

    search('  FERRY  ')

    expect(screen.getByText('Night Ferry')).toBeInTheDocument()
    expect(screen.queryByText('Blue Meridian')).toBeNull()
  })

  it('keeps a matching folder whole, including albums that do not match themselves', () => {
    openAllFolders()
    renderSidebar()

    search('vela')

    expect(screen.getByText('Solar Drift')).toBeInTheDocument()
    expect(screen.queryByText('Marlow Trio')).toBeNull()
  })

  it('restates the surviving album count on a pruned folder', () => {
    renderSidebar()

    // Collapsed, so the count badge is the only visible evidence of the pruning.
    expect(screen.getByText('Lossless').closest('.tfolder')?.textContent).toContain('3')

    search('ferry')

    expect(screen.getByText('Lossless').closest('.tfolder')?.textContent).toContain('1')
  })

  it('prunes to nothing when the query matches no album', () => {
    openAllFolders()
    const { container } = renderSidebar()

    search('zzzz')

    expect(container.querySelectorAll('.talbum')).toHaveLength(0)
    expect(container.querySelectorAll('.tfolder')).toHaveLength(0)
  })

  it('selects an album surfaced by a search', () => {
    openAllFolders()
    const { onSelect } = renderSidebar()

    search('ferry')
    fireEvent.click(screen.getByText('Night Ferry'))

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Lossless/Marlow Trio/Night Ferry' })
    )
  })
})

describe('Sidebar rescan', () => {
  it('fires onRescan when the button is clicked', () => {
    const { onRescan } = renderSidebar()

    fireEvent.click(screen.getByText('Rescan'))

    expect(onRescan).toHaveBeenCalledOnce()
  })

  it('marks the button busy and swallows clicks while a scan is in flight', () => {
    const { onRescan } = renderSidebar({ scanning: true })
    const button = screen.getByRole('button', { name: 'Rescan' })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    fireEvent.click(button)

    expect(onRescan).not.toHaveBeenCalled()
  })
})

describe('Sidebar scan log', () => {
  const log: LogEntry[] = [
    { seq: 1, time: '2026-07-20T14:03:22Z', level: 'warn', text: 'source file missing: image.flac' },
    { seq: 2, time: '2026-07-20T14:03:23Z', level: 'info', text: 'multi-file cue (already split): x' },
  ]
  const summary = { dirs_walked: 412, albums: 118, unsplit: 37, skipped: 6, elapsed_ms: 240 }

  it('renders collapsed by default, with the album/skipped summary in the header', () => {
    renderSidebar({ scanLog: log, scanSummary: summary })

    expect(screen.getByText('118 albums · 6 skipped')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scan log/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders each skipped-directory line with its level once opened', () => {
    const { container } = renderSidebar({ scanLog: log, scanSummary: summary })

    fireEvent.click(screen.getByRole('button', { name: /Scan log/ }))

    const items = container.querySelectorAll('.lbody li')
    expect(items).toHaveLength(2)
    expect(items[0].className).toBe('ll ll-warn')
    expect(items[0].textContent).toContain('source file missing: image.flac')
    expect(items[1].className).toBe('ll')
    expect(items[1].textContent).toContain('multi-file cue (already split): x')
  })
})
