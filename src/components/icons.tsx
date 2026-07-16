/** Icons shared across more than one component; single-use icons stay co-located. */

/** Red exclamation-in-circle, used by every `.errbox` head. */
export function ErrIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f36a6f" strokeWidth="2.4">
      <path d="M12 8v5M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}
