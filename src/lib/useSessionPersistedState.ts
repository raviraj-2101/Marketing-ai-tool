// useSessionPersistedState — useState that mirrors itself to localStorage,
// keyed per TSL session, so a value survives navigating between the Develop
// and Final-review pages (which unmount each other).
//
// Why lazy-init + a hydration guard instead of a "restore on mount" effect:
// under React.StrictMode the mount effects run twice, and a naive save effect
// fires with the *initial* value before the restore lands — overwriting good
// data with the default (this is what was wiping the approved tray). By seeding
// state from storage in the useState initializer, the very first value is
// already the persisted one, so the mount-time save is a no-op rather than a
// wipe. The `hydratedFor` ref additionally re-hydrates when the session key
// changes (e.g. switching to a different chat) and blocks saves during that
// transition.

import { useEffect, useRef, useState } from "react";
import { tslSessionStorageKey } from "@/lib/tslSession";

interface Options<T> {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

export function useSessionPersistedState<T>(
  sessionKey: string | undefined,
  subKey: string,
  initial: T,
  options?: Options<T>,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const serialize = options?.serialize ?? ((v: T) => JSON.stringify(v));
  const deserialize = options?.deserialize ?? ((raw: string) => JSON.parse(raw) as T);

  const read = (sk: string | undefined): T => {
    if (!sk || typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(tslSessionStorageKey(subKey, sk));
      return raw == null ? initial : deserialize(raw);
    } catch {
      return initial;
    }
  };

  const [value, setValue] = useState<T>(() => read(sessionKey));
  // The session key the current `value` was hydrated for. Initialised to the
  // first session key so the mount-time save is recognised as already hydrated.
  const hydratedFor = useRef<string | undefined>(sessionKey);

  // Re-hydrate when the session changes.
  useEffect(() => {
    if (sessionKey === hydratedFor.current) return;
    setValue(read(sessionKey));
    hydratedFor.current = sessionKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Persist. Never writes a pre-hydration value (value is lazy-seeded from
  // storage) and never writes during a pending session switch.
  useEffect(() => {
    if (!sessionKey || sessionKey !== hydratedFor.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(tslSessionStorageKey(subKey, sessionKey), serialize(value));
    } catch {
      /* ignore quota */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, value]);

  return [value, setValue];
}
