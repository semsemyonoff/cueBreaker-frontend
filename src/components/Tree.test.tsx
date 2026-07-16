import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ScanPair } from '../api/types'
import { buildTree } from '../tree/buildTree'
import Tree from './Tree'

beforeEach(() => {
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

function renderTree(items: ScanPair[]) {
  return render(<Tree nodes={buildTree(items)} selectedPath={null} onSelect={() => {}} />)
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
