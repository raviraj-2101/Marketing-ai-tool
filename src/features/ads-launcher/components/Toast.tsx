import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

const ToastCtx = createContext<{
  toast: (kind: ToastKind, message: string) => void;
} | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((arr) => [...arr, { id, kind, message }]);
    setTimeout(() => setToasts((arr) => arr.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${
              t.kind === "success"
                ? "bg-emerald-600 text-white"
                : t.kind === "error"
                ? "bg-red-600 text-white"
                : "bg-slate-800 text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx.toast;
}

export function useMutationToast() {
  const toast = useToast();
  return useCallback(
    (label: string) => ({
      onSuccess: () => toast("success", `${label} saved.`),
      onError: (e: any) => toast("error", e?.message ?? `${label} failed.`),
    }),
    [toast]
  );
}

export function aspectFromFilename(name: string): "9x16" | "4x5" | "1x1" | null {
  const n = name.toLowerCase();
  if (/(^|[^0-9])9x16([^0-9]|$)|(^|[^0-9])9_16|vertical|stories|reels/.test(n)) return "9x16";
  if (/(^|[^0-9])4x5|4_5|portrait|feed/.test(n)) return "4x5";
  if (/(^|[^0-9])1x1|1_1|square/.test(n)) return "1x1";
  return null;
}
