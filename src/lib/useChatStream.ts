import { useSyncExternalStore } from "react";
import {
  getStream,
  subscribe,
  type ChatStreamState,
} from "./streamStore";

/**
 * Subscribe to per-chat streaming state. Returns a stable snapshot that
 * re-renders whenever this chat's entry changes in the global store.
 *
 * Pass `null` for the unknown-yet (brand-new chat about to be created on
 * server) case — the hook returns `undefined` and the caller should fall back
 * to the legacy "no chat selected" rendering.
 */
export function useChatStream(
  key: string | null,
): ChatStreamState | undefined {
  return useSyncExternalStore(
    (cb) => (key ? subscribe(key, cb) : () => {}),
    () => (key ? getStream(key) : undefined),
    () => undefined,
  );
}
