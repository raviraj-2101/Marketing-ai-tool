import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};

type Resolver = (ok: boolean) => void;

type ConfirmCtxValue = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const ConfirmCtx = createContext<ConfirmCtxValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<{ opts: ConfirmOptions; resolve: Resolver } | null>(null);
  const titleId = useId();
  const descId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    previousFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    return new Promise<boolean>((resolve) => {
      setOpen({ opts, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  function close(ok: boolean) {
    open?.resolve(ok);
    setOpen(null);
    const target = previousFocus.current;
    if (target && typeof target.focus === "function") {
      setTimeout(() => {
        try { target.focus({ preventScroll: true }); } catch {}
      }, 0);
    }
    previousFocus.current = null;
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in"
          onClick={() => close(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 animate-in slide-in-from-bottom-2"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={open.opts.description ? descId : undefined}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${
                  open.opts.tone === "danger" ? "bg-red-100 text-red-600" : "bg-brand-50 text-brand-600"
                }`}
              >
                {open.opts.tone === "danger" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 9v4M12 17h.01" />
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 id={titleId} className="text-base font-semibold text-slate-900">{open.opts.title}</h2>
                {open.opts.description && (
                  <p id={descId} className="text-sm text-slate-600 mt-1">{open.opts.description}</p>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => close(false)}>
                {open.opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={open.opts.tone === "danger" ? "btn-danger text-sm" : "btn-primary text-sm"}
                onClick={() => close(true)}
                autoFocus
              >
                {open.opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx.confirm;
}
