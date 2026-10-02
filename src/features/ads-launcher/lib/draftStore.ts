const TTL_MS = 7 * 24 * 3600 * 1000;

function tabId(): string {
  if (typeof window === "undefined") return "ssr";
  if (!window.name || !window.name.startsWith("aut-")) {
    window.name = "aut-" + Math.random().toString(36).slice(2, 10);
  }
  return window.name;
}

export type DraftEnvelope<T> = {
  savedAt: number;
  tabId?: string;
  data: T;
};

export function readDraft<T>(key: string): { data: T; savedAt: number; fromOtherTab: boolean } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed?.savedAt) return null;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    const fromOtherTab = !!parsed.tabId && parsed.tabId !== tabId();
    return { data: parsed.data, savedAt: parsed.savedAt, fromOtherTab };
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T) {
  try {
    const env: DraftEnvelope<T> = { savedAt: Date.now(), tabId: tabId(), data };
    localStorage.setItem(key, JSON.stringify(env));
  } catch {
    // Quota or private-mode — ignore silently.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function relativeTime(epochMs: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}
