// tslSession — central management of the TSL builder's per-session localStorage.
//
// Every TSL builder value is stored under `tsl-v2:<subKey>:<sessionKey>`, where
// sessionKey is a chat id (uuid) or a free-form session id ("free-form-…").
// localStorage has NO expiry, so without housekeeping every chat/session ever
// opened leaks its scratch data (analysis cache, tray, selections, …) forever.
//
// This module bounds that growth:
//   • touchTslSession  — stamp a session as recently used (`last-seen`)
//   • clearTslSession  — drop every key for one session (used after a push)
//   • sweepStaleTslSessions — on load, remove sessions untouched for > TTL.
//     Legacy sessions with no stamp are stamped (not deleted) so they get a
//     full grace period instead of vanishing — nothing active is lost, and
//     anything pruned simply re-derives from the server on next open.

const PREFIX = "tsl-v2:";
const TOUCH_SUBKEY = "last-seen";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function tslSessionStorageKey(subKey: string, sessionKey: string): string {
  return `${PREFIX}${subKey}:${sessionKey}`;
}

// Whether a value has already been persisted for this session/subKey. Used for
// one-time defaults that must not clobber a restored choice (e.g. CS auto-select).
export function hasTslSessionValue(subKey: string, sessionKey: string | undefined): boolean {
  if (!sessionKey || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(tslSessionStorageKey(subKey, sessionKey)) != null;
  } catch {
    return false;
  }
}

// Split a "tsl-v2:<subKey>:<sessionKey>" key. subKeys never contain ":", so the
// first colon after the prefix is the boundary.
function parseTslKey(key: string): { subKey: string; sessionKey: string } | null {
  if (!key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const idx = rest.indexOf(":");
  if (idx <= 0) return null;
  const subKey = rest.slice(0, idx);
  const sessionKey = rest.slice(idx + 1);
  if (!subKey || !sessionKey) return null;
  return { subKey, sessionKey };
}

export function touchTslSession(sessionKey: string | undefined): void {
  if (!sessionKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tslSessionStorageKey(TOUCH_SUBKEY, sessionKey), String(Date.now()));
  } catch {
    /* ignore quota */
  }
}

export function clearTslSession(sessionKey: string | undefined): void {
  if (!sessionKey || typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const parsed = parseTslKey(key);
      if (parsed && parsed.sessionKey === sessionKey) toRemove.push(key);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function sweepStaleTslSessions(now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    const sessions = new Set<string>();
    const lastSeen = new Map<string, number>();
    // Read-only pass: discover sessions and their last-seen stamps.
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const parsed = parseTslKey(key);
      if (!parsed) continue;
      sessions.add(parsed.sessionKey);
      if (parsed.subKey === TOUCH_SUBKEY) {
        const t = Number(window.localStorage.getItem(key));
        if (Number.isFinite(t)) lastSeen.set(parsed.sessionKey, t);
      }
    }
    // Mutating pass: now safe (no longer iterating by index).
    for (const sk of sessions) {
      const seen = lastSeen.get(sk);
      if (seen === undefined) {
        // Legacy/unstamped session — give it a grace window from now.
        touchTslSession(sk);
      } else if (now - seen > TTL_MS) {
        clearTslSession(sk);
      }
    }
  } catch {
    /* ignore */
  }
}
