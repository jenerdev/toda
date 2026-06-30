// Single-active-session support (see migration 0020). Each DEVICE has a stable
// id, persisted so multiple tabs on the same device share one session (no
// self-eviction); a different device gets a different id, so logging in there
// supersedes this one.

const SESSION_KEY = 'mq.session_id'
const EVICTED_KEY = 'mq.evicted'

/** Stable per-device session id (created on first use). */
export function getDeviceSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    // localStorage/crypto unavailable — best-effort ephemeral id for this load.
    return 'ephemeral'
  }
}

/** Flag that this device was signed out because the account logged in elsewhere. */
export function markEvicted() {
  try {
    localStorage.setItem(EVICTED_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Read-and-clear the eviction flag (so the login screen can explain it once). */
export function consumeEvicted(): boolean {
  try {
    const evicted = localStorage.getItem(EVICTED_KEY) === '1'
    if (evicted) localStorage.removeItem(EVICTED_KEY)
    return evicted
  } catch {
    return false
  }
}
