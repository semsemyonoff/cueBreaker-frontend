import { albumLeaf } from '../tree/buildTree'

/** The bare document title, shown whenever no album is open. */
export const APP_TITLE = 'cueBreaker'

/**
 * The document title for the album addressed by albumPath (null when none is).
 *
 * Only the album's own name, not its whole path: the tab strip truncates from
 * the right, so a leading folder chain would be all a narrow tab ever shows.
 */
export function documentTitle(albumPath: string | null): string {
  if (albumPath === null) return APP_TITLE
  return `${albumLeaf(albumPath)} — ${APP_TITLE}`
}
