import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ActiveJob } from '../api/types'
import Shell from './Shell'

const DESKTOP_WIDTH = 1440
const MOBILE_WIDTH = 390

beforeEach(() => {
  window.localStorage.clear()
  window.innerWidth = DESKTOP_WIDTH
})

afterEach(() => {
  window.innerWidth = DESKTOP_WIDTH
})

function renderShell() {
  return render(
    <Shell items={[]} selectedPath={null} onSelect={() => {}} onRescan={() => {}} version="1.0.0">
      <p>work panel</p>
    </Shell>
  )
}

describe('Shell mobile drawer', () => {
  it('opens the sidebar drawer on burger click and closes it on scrim click', () => {
    const { container } = render(
      <Shell items={[]} selectedPath={null} onSelect={() => {}} onRescan={() => {}} version="1.0.0">
        <p>work panel</p>
      </Shell>
    )

    const sidewrap = container.querySelector('.sidewrap')
    expect(sidewrap?.className).not.toContain('drawer-open')
    expect(container.querySelector('.scrim')).toBeNull()

    fireEvent.click(screen.getByLabelText('Toggle library'))
    expect(sidewrap?.className).toContain('drawer-open')
    expect(container.querySelector('.scrim')).not.toBeNull()

    fireEvent.click(container.querySelector('.scrim')!)
    expect(sidewrap?.className).not.toContain('drawer-open')
    expect(container.querySelector('.scrim')).toBeNull()
  })

  it('closes the drawer when an album is selected', () => {
    const item = {
      path: 'Album',
      abs_path: '/input/Album',
      cue_files: ['album.cue'],
      flac_files: ['album.flac'],
      split_done: false,
      output_tracks: 0,
    }

    const { container } = render(
      <Shell
        items={[item]}
        selectedPath={null}
        onSelect={() => {}}
        onRescan={() => {}}
        version="1.0.0"
      />
    )

    fireEvent.click(screen.getByLabelText('Toggle library'))
    expect(container.querySelector('.sidewrap')?.className).toContain('drawer-open')

    fireEvent.click(screen.getByText('Album'))
    expect(container.querySelector('.sidewrap')?.className).not.toContain('drawer-open')
  })
})

describe('Shell resizer keyboard a11y', () => {
  it('advertises the current width and its bounds', () => {
    const { container } = renderShell()
    const resizer = container.querySelector('.resizer')!

    expect(resizer).toHaveAttribute('tabindex', '0')
    expect(resizer).toHaveAttribute('aria-valuenow', '300')
    expect(resizer).toHaveAttribute('aria-valuemin', '220')
    expect(resizer).toHaveAttribute('aria-valuemax', '480')
  })

  it('resizes with the arrow keys', () => {
    const { container } = renderShell()
    const resizer = container.querySelector('.resizer')!
    const sidewrap = container.querySelector('.sidewrap') as HTMLElement

    fireEvent.keyDown(resizer, { key: 'ArrowRight' })
    expect(resizer).toHaveAttribute('aria-valuenow', '316')
    expect(sidewrap.style.getPropertyValue('--sidebar-w')).toBe('316px')

    fireEvent.keyDown(resizer, { key: 'ArrowLeft' })
    expect(resizer).toHaveAttribute('aria-valuenow', '300')

    fireEvent.keyDown(resizer, { key: 'ArrowRight', shiftKey: true })
    expect(resizer).toHaveAttribute('aria-valuenow', '364')
  })

  it('clamps at the 220/480 bounds', () => {
    const { container } = renderShell()
    const resizer = container.querySelector('.resizer')!

    for (let i = 0; i < 20; i++) fireEvent.keyDown(resizer, { key: 'ArrowLeft', shiftKey: true })
    expect(resizer).toHaveAttribute('aria-valuenow', '220')

    for (let i = 0; i < 20; i++) fireEvent.keyDown(resizer, { key: 'ArrowRight', shiftKey: true })
    expect(resizer).toHaveAttribute('aria-valuenow', '480')
  })

  it('jumps to the bounds with Home and End, and ignores other keys', () => {
    const { container } = renderShell()
    const resizer = container.querySelector('.resizer')!

    fireEvent.keyDown(resizer, { key: 'End' })
    expect(resizer).toHaveAttribute('aria-valuenow', '480')

    fireEvent.keyDown(resizer, { key: 'Home' })
    expect(resizer).toHaveAttribute('aria-valuenow', '220')

    fireEvent.keyDown(resizer, { key: 'a' })
    expect(resizer).toHaveAttribute('aria-valuenow', '220')
  })
})

describe('Shell ambient splitting state', () => {
  const album = {
    path: 'Album',
    abs_path: '/input/Album',
    cue_files: ['album.cue', 'other.cue'],
    flac_files: ['album.flac'],
    split_done: false,
    output_tracks: 0,
  }

  function renderWithJob(activeJob: ActiveJob | null) {
    return render(
      <Shell
        items={[album]}
        selectedPath="Album"
        onSelect={() => {}}
        onRescan={() => {}}
        version="1.0.0"
        activeJob={activeJob}
      />
    )
  }

  it('shows the album count and a calm dot when nothing is splitting', () => {
    const { container } = renderWithJob(null)

    expect(container.querySelector('.dot')?.className).toBe('dot')
    expect(container.querySelector('.tstat')?.textContent).toBe('1 albums1 unsplit')
    expect(container.querySelector('.tameta')?.textContent).toBe('2 cues')
  })

  it('replaces the album count with "1 splitting", runs the dot, and shows tree progress', () => {
    const { container } = renderWithJob({
      path: 'Album',
      status: 'splitting',
      progressCurrent: 5,
      progressTotal: 8,
    })

    expect(container.querySelector('.dot')?.className).toBe('dot run')
    expect(container.querySelector('.tstat')?.textContent).toBe('1 splitting1 unsplit')
    expect(container.querySelector('.tameta')?.textContent).toBe('63%')
  })

  it('leaves other albums alone while one is splitting', () => {
    const other = { ...album, path: 'Other', cue_files: ['other.cue'] }
    const { container } = render(
      <Shell
        items={[album, other]}
        selectedPath="Album"
        onSelect={() => {}}
        onRescan={() => {}}
        version="1.0.0"
        activeJob={{ path: 'Album', status: 'splitting', progressCurrent: 1, progressTotal: 4 }}
      />
    )

    const metas = [...container.querySelectorAll('.tameta')].map((el) => el.textContent)
    expect(metas).toEqual(['25%', '1 cue'])
  })

  it('shows 0% rather than NaN before the job reports a total', () => {
    const { container } = renderWithJob({
      path: 'Album',
      status: 'queued',
      progressCurrent: 0,
      progressTotal: 0,
    })

    expect(container.querySelector('.tameta')?.textContent).toBe('0%')
  })
})

describe('Shell drawer a11y', () => {
  it('reflects the drawer state in the burger aria-expanded', () => {
    renderShell()
    const burger = screen.getByLabelText('Toggle library')

    expect(burger).toHaveAttribute('aria-expanded', 'false')
    expect(burger).toHaveAttribute('aria-controls', 'library-drawer')

    fireEvent.click(burger)
    expect(burger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(burger)
    expect(burger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the drawer on Escape', () => {
    const { container } = renderShell()

    fireEvent.click(screen.getByLabelText('Toggle library'))
    expect(container.querySelector('.sidewrap')?.className).toContain('drawer-open')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.sidewrap')?.className).not.toContain('drawer-open')
  })

  it('moves focus into the drawer on open and back to the burger on close', () => {
    window.innerWidth = MOBILE_WIDTH
    renderShell()
    const burger = screen.getByLabelText('Toggle library')

    fireEvent.click(burger)
    expect(screen.getByLabelText('Search library')).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(burger).toHaveFocus()
  })

  it('inerts the closed drawer on mobile and never on desktop', () => {
    window.innerWidth = MOBILE_WIDTH
    const mobile = renderShell()
    const mobileDrawer = mobile.container.querySelector('.sidewrap')!

    expect(mobileDrawer).toHaveAttribute('inert')
    expect(mobileDrawer).toHaveAttribute('aria-hidden', 'true')
    // jsdom does not implement inert's focus semantics, so assert the attribute
    // that the browser acts on rather than trying to Tab through the drawer.
    expect(screen.getByLabelText('Search library').closest('[inert]')).toBe(mobileDrawer)

    fireEvent.click(screen.getByLabelText('Toggle library'))
    expect(mobileDrawer).not.toHaveAttribute('inert')
    expect(mobileDrawer).not.toHaveAttribute('aria-hidden')

    mobile.unmount()

    window.innerWidth = DESKTOP_WIDTH
    const { container } = renderShell()
    const desktopDrawer = container.querySelector('.sidewrap')!
    expect(desktopDrawer).not.toHaveAttribute('inert')
    expect(desktopDrawer).not.toHaveAttribute('aria-hidden')
  })
})
