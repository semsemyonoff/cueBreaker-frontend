import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ScanPair } from '../api/types'
import { buildTree, loadOpenPaths } from '../tree/buildTree'
import Tree from './Tree'

beforeEach(() => {
  window.localStorage.clear()
})

function pair(path: string, overrides: Partial<ScanPair> = {}): ScanPair {
  return {
    path,
    abs_path: `/input/${path}`,
    cue_files: ['album.cue'],
    flac_files: ['album.flac'],
    split_done: false,
    output_tracks: 0,
    ...overrides,
  }
}

function renderTree(
  items: ScanPair[],
  props: { selectedPath?: string | null; onSelect?: (item: ScanPair) => void } = {}
) {
  const { selectedPath = null, onSelect = () => {} } = props
  return render(<Tree nodes={buildTree(items)} selectedPath={selectedPath} onSelect={onSelect} />)
}

describe('Tree folder a11y', () => {
  it('exposes aria-expanded on folder rows and flips it on toggle', () => {
    renderTree([pair('Lossless/Marlow Trio')])

    const folder = screen.getByText('Lossless').closest('.tfolder')!
    expect(folder).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Marlow Trio')).toBeNull()

    fireEvent.click(folder)
    expect(folder).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Marlow Trio')).toBeInTheDocument()

    fireEvent.click(folder)
    expect(folder).toHaveAttribute('aria-expanded', 'false')
  })

  it('flips aria-expanded when the folder is toggled by keyboard', () => {
    renderTree([pair('Lossless/Marlow Trio')])

    const folder = screen.getByText('Lossless').closest('.tfolder')!
    fireEvent.keyDown(folder, { key: 'Enter' })
    expect(folder).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(folder, { key: ' ' })
    expect(folder).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not put aria-expanded on album rows', () => {
    renderTree([pair('Album')])

    expect(screen.getByText('Album').closest('.talbum')).not.toHaveAttribute('aria-expanded')
  })
})

describe('Tree folder toggling', () => {
  it('reveals children and marks the arrow open only while expanded', () => {
    renderTree([pair('Lossless/Marlow Trio'), pair('Lossless/Deep Cut')])

    const folder = screen.getByText('Lossless').closest('.tfolder')!
    const arrow = folder.querySelector('.tarrow')!
    expect(arrow).not.toHaveClass('open')
    expect(screen.queryByText('Deep Cut')).toBeNull()

    fireEvent.click(folder)
    expect(arrow).toHaveClass('open')
    expect(screen.getByText('Deep Cut')).toBeInTheDocument()
    expect(screen.getByText('Marlow Trio')).toBeInTheDocument()

    fireEvent.click(folder)
    expect(arrow).not.toHaveClass('open')
    expect(screen.queryByText('Deep Cut')).toBeNull()
  })

  it('counts the albums under a folder', () => {
    renderTree([pair('Lossless/Marlow Trio'), pair('Lossless/Deep Cut')])

    expect(
      screen.getByText('Lossless').closest('.tfolder')!.querySelector('.tcount')
    ).toHaveTextContent('2')
  })

  it('persists the open folder and restores it on remount', () => {
    const items = [pair('Lossless/Marlow Trio')]
    const first = renderTree(items)

    fireEvent.click(screen.getByText('Lossless').closest('.tfolder')!)
    expect(loadOpenPaths()).toEqual(new Set(['Lossless']))

    first.unmount()
    renderTree(items)

    expect(screen.getByText('Lossless').closest('.tfolder')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('Marlow Trio')).toBeInTheDocument()
  })

  it('persists a collapsed folder as closed across a remount', () => {
    const items = [pair('Lossless/Marlow Trio')]
    const first = renderTree(items)

    const folder = screen.getByText('Lossless').closest('.tfolder')!
    fireEvent.click(folder)
    fireEvent.click(folder)
    expect(loadOpenPaths()).toEqual(new Set())

    first.unmount()
    renderTree(items)

    expect(screen.getByText('Lossless').closest('.tfolder')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})

describe('Tree keyboard activation', () => {
  it('activates an album row on Enter and on Space, preventing the default', () => {
    const onSelect = vi.fn()
    renderTree([pair('Album')], { onSelect })
    const album = screen.getByText('Album').closest('.talbum')!

    for (const key of ['Enter', ' ']) {
      const prevented = !fireEvent.keyDown(album, { key })
      expect(prevented).toBe(true)
    }
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: 'Album' }))
  })

  it('prevents the default when a folder row is activated by keyboard', () => {
    renderTree([pair('Lossless/Marlow Trio')])
    const folder = screen.getByText('Lossless').closest('.tfolder')!

    expect(!fireEvent.keyDown(folder, { key: 'Enter' })).toBe(true)
    expect(!fireEvent.keyDown(folder, { key: ' ' })).toBe(true)
  })

  it('ignores other keys on both row kinds', () => {
    const onSelect = vi.fn()
    renderTree([pair('Lossless/Marlow Trio'), pair('Album')], { onSelect })

    const folder = screen.getByText('Lossless').closest('.tfolder')!
    fireEvent.keyDown(folder, { key: 'a' })
    expect(folder).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(screen.getByText('Album').closest('.talbum')!, { key: 'ArrowDown' })
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('Tree album rows', () => {
  it('marks only the selected album active', () => {
    renderTree([pair('Album A'), pair('Album B')], { selectedPath: 'Album B' })

    expect(screen.getByText('Album A').closest('.talbum')).not.toHaveClass('active')
    expect(screen.getByText('Album B').closest('.talbum')).toHaveClass('active')
  })

  it('renders a check instead of the cue count for a split album', () => {
    renderTree([pair('Album', { split_done: true, output_tracks: 9 })])

    const album = screen.getByText('Album').closest('.talbum')!
    expect(album).toHaveClass('done')
    expect(album.querySelector('.tcheck')).toHaveTextContent('✓')
    expect(album.querySelector('.tameta')).toBeNull()
  })

  it('pluralizes the cue count', () => {
    renderTree([
      pair('One', { cue_files: ['a.cue'] }),
      pair('Two', { cue_files: ['a.cue', 'b.cue'] }),
    ])

    expect(screen.getByText('One').closest('.talbum')!.querySelector('.tameta')).toHaveTextContent(
      '1 cue'
    )
    expect(screen.getByText('Two').closest('.talbum')!.querySelector('.tameta')).toHaveTextContent(
      '2 cues'
    )
  })

  it('renders the synthetic [this folder] leaf and makes it selectable', () => {
    const onSelect = vi.fn()
    renderTree([pair('Lossless'), pair('Lossless/Marlow Trio')], { onSelect })

    fireEvent.click(screen.getByText('Lossless').closest('.tfolder')!)

    const leaf = screen.getByText('[this folder]').closest('.talbum')!
    fireEvent.click(leaf)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: 'Lossless' }))
  })
})

describe('Tree with non-ASCII names', () => {
  it('renders and selects a Cyrillic album', () => {
    const onSelect = vi.fn()
    renderTree([pair('Эпидемия - Придумай светлый мир')], { onSelect })

    const album = screen.getByText('Эпидемия - Придумай светлый мир').closest('.talbum')!
    fireEvent.click(album)
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Эпидемия - Придумай светлый мир' })
    )
  })

  it('orders mixed-script siblings by the pinned collator, not the runtime default', () => {
    renderTree([
      pair('Lossless/Эпидемия - Придумай светлый мир'),
      pair('Lossless/Blue Meridian'),
      pair('Lossless/Ария - Герой асфальта'),
    ])

    fireEvent.click(screen.getByText('Lossless').closest('.tfolder')!)

    const names = [...document.querySelectorAll('.taname')].map((el) => el.textContent)
    expect(names).toEqual([
      'Blue Meridian',
      'Ария - Герой асфальта',
      'Эпидемия - Придумай светлый мир',
    ])
  })
})
