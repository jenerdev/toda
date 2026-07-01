// Lightweight app-wide snackbar (transient toast). A module-level emitter so any
// code — event handlers, hooks, non-React modules — can raise a snackbar without
// prop-drilling or a context in every file. <Snackbar /> (mounted once at the app
// root) is the single subscriber that renders them.

export const RATE_LIMIT_MESSAGE =
  "You're doing that too fast — please wait a moment and try again."

type Listener = (message: string) => void

let listeners: Listener[] = []

/** Show a snackbar with the given message. */
export function showSnackbar(message: string): void {
  for (const l of listeners) l(message)
}

/** Subscribe to snackbar events; returns an unsubscribe fn. */
export function subscribeSnackbar(listener: Listener): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

/**
 * True if this error is a rate-limit rejection raised by check_rate_limit
 * (migration 0029). Matches on the message the function raises, which is the
 * stable contract between the DB and the client.
 */
export function isRateLimitError(error: unknown): boolean {
  const message = (error as { message?: unknown } | null | undefined)?.message
  return typeof message === 'string' && message.includes('Too many requests')
}

/**
 * If `error` is a rate-limit rejection, surface the snackbar and return true so
 * the caller can skip its own error handling. Returns false for anything else,
 * leaving the caller to handle it as before.
 */
export function notifyIfRateLimited(error: unknown): boolean {
  if (!isRateLimitError(error)) return false
  showSnackbar(RATE_LIMIT_MESSAGE)
  return true
}
