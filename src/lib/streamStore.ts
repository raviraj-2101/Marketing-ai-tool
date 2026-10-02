// Per-chat streaming store.
//
// Why this exists: the previous design tied "is a stream running" to component
// state in pages/chat.tsx. When the user navigated to another chat mid-stream,
// the component's local state was still attached to the original streaming
// chat — but the abort-on-nav-away effect would kill the request. The user's
// mental model is the opposite: "let it keep running in the background, I'll
// come back to read it". So streaming has to live OUTSIDE the chat component.
//
// Design:
//   * One global Map<chatId, ChatStreamState>. Survives component remounts.
//   * For brand-new chats whose server id isn't known yet, we use a
//     temporary key (`pending:<localId>`) and rekey to the real chat id once
//     onMeta fires. Subscribers are migrated automatically.
//   * Tiny pub/sub: `subscribe(chatId, fn)` calls fn() whenever the entry for
//     that chatId changes. Used by useChatStream() to drive React re-renders.
//
// We deliberately avoid pulling in zustand/redux — this is a single concern
// with ~5 readers, so a 70-line file is the right amount of code.

export type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  awaitingFirstByte?: boolean;
  startedAt?: number;
  finishedAt?: number;
};

export type ChatStreamState = {
  /** Locally-rendered messages, including in-flight optimistic ones. */
  messages: LocalMessage[];
  /** True while a stream is in flight for this chat. */
  streaming: boolean;
  /** AbortController for the in-flight request, if any. */
  abort: AbortController | null;
  /** Server-side job id for the in-flight generation. Used by stopGeneration
   *  to POST /api/ugc/jobs/:jobId/cancel so we actually stop burning Anthropic
   *  tokens — aborting the client fetch alone doesn't reach the LLM. */
  jobId?: string | null;
  /**
   * Timestamp (ms since epoch) of when this chat finished streaming while the
   * user was NOT viewing it. Drives the "unread" dot in the sidebar.
   * `null` means the chat has been read (or has never finished a stream while
   * unfocused).
   */
  unreadAt?: number | null;
};

type Listener = (state: ChatStreamState | undefined) => void;

const states = new Map<string, ChatStreamState>();
const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  const set = listeners.get(key);
  if (!set) return;
  const snap = states.get(key);
  for (const fn of set) fn(snap);
}

export function getStream(key: string): ChatStreamState | undefined {
  return states.get(key);
}

export function setStream(
  key: string,
  patch: Partial<ChatStreamState> | ((prev: ChatStreamState | undefined) => ChatStreamState),
): void {
  const prev = states.get(key);
  const next =
    typeof patch === "function"
      ? patch(prev)
      : { messages: [], streaming: false, abort: null, ...prev, ...patch };
  states.set(key, next);
  notify(key);
}

export function clearStream(key: string): void {
  states.delete(key);
  notify(key);
}

export function subscribe(key: string, fn: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(key);
  };
}

/**
 * Rekey an entry from a temporary id (e.g. "pending:abc123") to the real
 * server-assigned chat id. Migrates listeners so a component subscribed to the
 * temporary id keeps getting updates after onMeta arrives.
 *
 * If both keys already have entries, the source wins (it's the active stream)
 * and the destination is overwritten — the destination might exist if a
 * sidebar query had pre-warmed it.
 */
export function rekey(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  const src = states.get(fromKey);
  if (src) {
    states.set(toKey, src);
    states.delete(fromKey);
  }
  // Migrate listeners from old key to new key.
  const fromListeners = listeners.get(fromKey);
  if (fromListeners) {
    let toListeners = listeners.get(toKey);
    if (!toListeners) {
      toListeners = new Set();
      listeners.set(toKey, toListeners);
    }
    for (const fn of fromListeners) toListeners.add(fn);
    listeners.delete(fromKey);
  }
  notify(toKey);
  notify(fromKey);
}

/** Update messages for a key. Convenience over setStream. */
export function updateMessages(
  key: string,
  updater: (prev: LocalMessage[]) => LocalMessage[],
): void {
  const prev = states.get(key);
  const messages = updater(prev?.messages ?? []);
  setStream(key, { messages });
}

/**
 * Mark a chat as having an unread response. Called from chat.tsx onDone when
 * the just-finished stream's chatId doesn't match the currently-viewed one.
 * Idempotent — callers don't need to check if an entry exists; we create one
 * if needed so the sidebar can still subscribe.
 */
export function markUnread(key: string): void {
  setStream(key, (prev) => ({
    messages: prev?.messages ?? [],
    streaming: prev?.streaming ?? false,
    abort: prev?.abort ?? null,
    unreadAt: Date.now(),
  }));
}

/**
 * Mark a chat as read. Called when the user navigates to it. Safe to call on
 * a chat that has no entry — we no-op in that case to avoid accidentally
 * spawning empty stream entries that would mask a server fetch.
 */
export function markRead(key: string): void {
  const prev = states.get(key);
  if (!prev) return;
  if (prev.unreadAt == null) return; // already read
  setStream(key, { unreadAt: null });
}
