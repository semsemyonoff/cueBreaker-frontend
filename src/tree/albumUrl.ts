/**
 * The query parameter carrying the selected album's scan-relative path.
 *
 * A query parameter rather than a path segment: it cannot collide with a
 * real asset (`/logo.svg`), needs no SPA fallback, and survives any base
 * path the app is ever served under.
 */
const ALBUM_PARAM = 'album'

/**
 * The href addressing an album, relative to the current document so the
 * base path stays wherever it already is.
 *
 * The whole path is escaped as one opaque value — unlike the API's
 * per-segment encoding (see `coverUrl` in `../api/client`), where the
 * slashes must survive as directory separators.
 */
export function albumHref(path: string): string {
  return `?${ALBUM_PARAM}=${encodeURIComponent(path)}`
}

/** The album path addressed by a `location.search` string, or null. */
export function readAlbumPath(search: string): string | null {
  return new URLSearchParams(search).get(ALBUM_PARAM)
}
