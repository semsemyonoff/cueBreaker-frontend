import { describe, expect, it } from 'vitest'
import { APP_TITLE, documentTitle } from './title'

describe('documentTitle', () => {
  it('is the bare app name when no album is open', () => {
    expect(documentTitle(null)).toBe(APP_TITLE)
  })

  it('leads with the album name, dropping the folders above it', () => {
    expect(documentTitle('Lossless/Marlow Trio')).toBe(`Marlow Trio — ${APP_TITLE}`)
  })

  it('names a root-level album by its whole path', () => {
    expect(documentTitle('Album')).toBe(`Album — ${APP_TITLE}`)
  })
})
