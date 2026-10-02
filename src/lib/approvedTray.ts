// approvedTray.ts — shared logic for the "tick → add → approved tray" flow.
// Pure functions only — no rendering dependencies.

export interface GeneratedImage {
  url: string;
  category_id: string;
  prompt: string;
  variation_note: string;
  id?: string;
  driveFileId?: string | null;
  bytes?: number;
  generated_at?: number;
}

export interface ApprovedImage extends GeneratedImage {
  dedupeKey: string;
  approvedInRound: number;
  approvedAt: number;
}

export function makeDedupeKey(img: GeneratedImage): string {
  return img.url;
}

export function addToTray(
  tray: ApprovedImage[],
  picks: GeneratedImage[],
  round: number,
  now: number,
): ApprovedImage[] {
  const existing = new Set(tray.map((t) => t.dedupeKey));
  const additions: ApprovedImage[] = [];
  for (const p of picks) {
    const key = makeDedupeKey(p);
    if (existing.has(key)) continue;
    existing.add(key);
    additions.push({ ...p, dedupeKey: key, approvedInRound: round, approvedAt: now });
  }
  return [...tray, ...additions];
}

export function removeFromTray(tray: ApprovedImage[], dedupeKey: string): ApprovedImage[] {
  return tray.filter((t) => t.dedupeKey !== dedupeKey);
}

export function groupTrayByCategory(tray: ApprovedImage[]): Record<string, ApprovedImage[]> {
  const out: Record<string, ApprovedImage[]> = {};
  for (const t of tray) {
    (out[t.category_id] = out[t.category_id] || []).push(t);
  }
  return out;
}

const STORAGE_PREFIX = "tsl-v2:approved-tray:";

export function trayStorageKey(chatId: string | undefined): string | null {
  if (!chatId) return null;
  return STORAGE_PREFIX + chatId;
}

export function loadTray(chatId: string | undefined): ApprovedImage[] {
  const key = trayStorageKey(chatId);
  if (!key) return [];
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (!raw) return [];
    const arr = JSON.parse(raw) as ApprovedImage[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveTray(chatId: string | undefined, tray: ApprovedImage[]): void {
  const key = trayStorageKey(chatId);
  if (!key) return;
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(tray));
  } catch { /* ignore quota */ }
}

export function clearTray(chatId: string | undefined): void {
  const key = trayStorageKey(chatId);
  if (!key) return;
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } catch { /* ignore */ }
}

// ─── Generated images snapshot ────────────────────────────────────────────────
// Persists the last generation round so navigation/reload restores the images.

const GENERATED_PREFIX = "tsl-v2:generated-images:";

export interface GeneratedImagesSnapshot {
  images: GeneratedImage[];
  perCategory: Array<{ categoryId: string; images: Array<{ url: string }> }>;
  renderFailures?: Array<{ categoryId?: string; reason: string }>;
  savedAt: number;
}

export function loadGeneratedImages(chatId: string | undefined): GeneratedImagesSnapshot | null {
  if (!chatId) return null;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(GENERATED_PREFIX + chatId) : null;
    if (!raw) return null;
    return JSON.parse(raw) as GeneratedImagesSnapshot;
  } catch {
    return null;
  }
}

export function saveGeneratedImages(chatId: string | undefined, snapshot: GeneratedImagesSnapshot): void {
  if (!chatId) return;
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(GENERATED_PREFIX + chatId, JSON.stringify(snapshot));
  } catch { /* ignore quota */ }
}

export function clearGeneratedImages(chatId: string | undefined): void {
  if (!chatId) return;
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(GENERATED_PREFIX + chatId);
  } catch { /* ignore */ }
}
