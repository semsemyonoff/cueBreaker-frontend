import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
