import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import Topbar from './Topbar'

describe('Topbar version badge', () => {
  it('renders the version badge when a version is set', () => {
    const { container } = render(
      <Topbar version="1.2.3" albumCount={4} unsplitCount={2} onBurgerClick={() => {}} />
    )

    expect(container.querySelector('.ver')?.textContent).toBe('v1.2.3')
  })

  it('renders no badge when the version is empty', () => {
    const { container } = render(
      <Topbar version="" albumCount={0} unsplitCount={0} onBurgerClick={() => {}} />
    )

    expect(container.querySelector('.ver')).toBeNull()
  })
})
