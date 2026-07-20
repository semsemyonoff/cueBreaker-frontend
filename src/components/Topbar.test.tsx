import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import Topbar from './Topbar'

describe('Topbar version badge', () => {
  it('renders the version badge when a version is set', () => {
    const { container } = render(
      <Topbar
        version="1.2.3"
        albumCount={4}
        unsplitCount={2}
        splittingCount={0}
        drawerOpen={false}
        drawerId="library-drawer"
        onBurgerClick={() => {}}
      />
    )

    expect(container.querySelector('.ver')?.textContent).toBe('v1.2.3')
  })

  it('renders no badge when the version is empty', () => {
    const { container } = render(
      <Topbar
        version=""
        albumCount={0}
        unsplitCount={0}
        splittingCount={0}
        drawerOpen={false}
        drawerId="library-drawer"
        onBurgerClick={() => {}}
      />
    )

    expect(container.querySelector('.ver')).toBeNull()
  })

  it('renders the shntool badge beside the app version', () => {
    const { container } = render(
      <Topbar
        version="1.2.3"
        shntoolVersion="3.0.10"
        albumCount={4}
        unsplitCount={2}
        splittingCount={0}
        drawerOpen={false}
        drawerId="library-drawer"
        onBurgerClick={() => {}}
      />
    )

    const badges = [...container.querySelectorAll('.ver')].map((el) => el.textContent)
    expect(badges).toEqual(['v1.2.3', 'shntool 3.0.10'])
  })

  it('renders no shntool badge when the backend could not determine the version', () => {
    const { container } = render(
      <Topbar
        version="1.2.3"
        albumCount={4}
        unsplitCount={2}
        splittingCount={0}
        drawerOpen={false}
        drawerId="library-drawer"
        onBurgerClick={() => {}}
      />
    )

    expect(container.querySelector('.ver.tool')).toBeNull()
  })
})
