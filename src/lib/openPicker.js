// Native date/time inputs only open their calendar from the small icon. Use as
// `onClick={openPicker}` so a tap anywhere in the field opens it. showPicker()
// is missing on older browsers and throws in some contexts (e.g. a
// cross-origin iframe); the plain input still works there.
export function openPicker(e) {
  try {
    e.currentTarget.showPicker?.()
  } catch {
    // fall back to the browser's default behaviour
  }
}
