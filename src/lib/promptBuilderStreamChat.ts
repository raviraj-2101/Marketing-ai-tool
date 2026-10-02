// promptBuilderStreamChat.ts — poll-until-done client for the UGC Automations
// "verify prompt" chat. Cloned from tslStreamChat.ts but targeting the
// image-builder API_BASE (NOT the pipeline-node PIPELINE_API_BASE) and the
// poll-until-done job shape used by image-builder's UGC endpoints — there is NO
// token-delta stream here: the full assistant message (carrying the embedded
// <!--ADS_RESULTS:base64--> marker) is delivered once on `done` via onDelta.
//
// Routes (mounted under /api/automations in image-builder):
//   POST /api/automations/prompt-builder            → 202 { jobId }
//   GET  /api/automations/prompt-builder/jobs/:jobId → { status } | { status, message } | { status, error }
//   POST /api/automations/prompt-builder/jobs/:jobId/cancel
//
// Auth: reuse the canonical exported authHeaders from ./queryClient (do NOT
// re-implement the localStorage key here).
import { API_BASE, authHeaders } from "./queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromptBuilderBody = {
  user_id: string;
  product: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

export type PromptBuilderHandlers = {
  onMeta?: (data: { jobId: string }) => void;
  onDelta?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  onCancelled?: () => void;
};

// ── Poll config ───────────────────────────────────────────────────────────────
// Same adaptive cadence as tslStreamChat: fast for the first quick replies, then
// back off so a long verify turn doesn't hammer the server (up to ~8 minutes).
const POLL_DELAYS_MS = [
  500, 500, 500, 500,
  1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500,
];
const POLL_LONG_DELAY_MS = 3000;
const MAX_POLL_BUDGET_MS = 8 * 60 * 1000;

// ── startPromptBuilderChat ──────────────────────────────────────────────────
// POST → { jobId }, then poll the job to a terminal status. Returns { abort() }
// so the caller can cancel in-flight polls (the server-side cancel is a separate
// best-effort POST, see cancelPromptBuilderChat).
export function startPromptBuilderChat(
  body: PromptBuilderBody,
  handlers: PromptBuilderHandlers,
): { abort: () => void } {
  const controller = new AbortController();
  void _run(body, handlers, controller.signal);
  return { abort: () => controller.abort() };
}

async function _run(
  body: PromptBuilderBody,
  handlers: PromptBuilderHandlers,
  signal: AbortSignal,
): Promise<void> {
  // 1. Start the job ──────────────────────────────────────────────────────────
  let startRes: Response;
  try {
    startRes = await fetch(`${API_BASE}/api/automations/prompt-builder`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: unknown) {
    if (signal.aborted) return;
    handlers.onError?.((err instanceof Error ? err.message : undefined) || "Network error");
    return;
  }

  if (!startRes.ok) {
    let msg = `HTTP ${startRes.status}`;
    try {
      const j = await startRes.json();
      if (j?.error) msg = j.error;
      else if (j?.message) msg = j.message;
    } catch {
      try { msg = (await startRes.text()) || msg; } catch { /* ignore */ }
    }
    handlers.onError?.(msg);
    return;
  }

  let jobId: string;
  try {
    ({ jobId } = (await startRes.json()) as { jobId: string });
  } catch {
    handlers.onError?.("Malformed start response");
    return;
  }
  handlers.onMeta?.({ jobId });

  // 2. Poll the job to completion ───────────────────────────────────────────────
  const startedAt = Date.now();
  let pollIdx = 0;

  while (Date.now() - startedAt < MAX_POLL_BUDGET_MS) {
    if (signal.aborted) return;

    const delay = pollIdx < POLL_DELAYS_MS.length ? POLL_DELAYS_MS[pollIdx] : POLL_LONG_DELAY_MS;
    await new Promise<void>((r) => setTimeout(r, delay));
    pollIdx++;

    if (signal.aborted) return;

    let pollRes: Response;
    try {
      pollRes = await fetch(
        `${API_BASE}/api/automations/prompt-builder/jobs/${jobId}`,
        { method: "GET", headers: authHeaders(), signal },
      );
    } catch {
      // Transient network blip — keep polling unless aborted.
      if (signal.aborted) return;
      continue;
    }

    if (!pollRes.ok) {
      // 4xx → terminal; 5xx → transient, keep polling.
      if (pollRes.status >= 400 && pollRes.status < 500) {
        let msg = `HTTP ${pollRes.status}`;
        try {
          const j = await pollRes.json();
          if (j?.error) msg = j.error;
          else if (j?.message) msg = j.message;
        } catch { /* ignore */ }
        handlers.onError?.(msg);
        return;
      }
      continue;
    }

    const data = (await pollRes.json()) as {
      status: "pending" | "done" | "error" | "cancelled";
      message?: string;
      error?: string;
    };

    if (data.status === "error") {
      // GAP #5: distinct "ads backend unavailable" text comes from the server.
      handlers.onError?.(data.error || "Verification failed");
      return;
    }

    if (data.status === "cancelled") {
      handlers.onCancelled?.();
      return;
    }

    if (data.status === "done") {
      // Poll (not stream): the FULL assistant message arrives at once and
      // carries the embedded <!--ADS_RESULTS--> marker for the chip strip.
      handlers.onDelta?.(data.message || "");
      handlers.onDone?.();
      return;
    }

    // status === 'pending' → keep polling.
  }

  handlers.onError?.("Timed out waiting for response");
}

// ── consolidatePromptRequest (DORMANT — removed by design 2026-06-30) ─────────
// One-shot POST → AI-merged standalone prompt. Removed because the draft now stores the
// operator's last refined prompt verbatim. To revive: uncomment this + the backend route
// (POST /api/automations/prompt-builder/consolidate) + controller + validator + service.
// export async function consolidatePromptRequest(body: {
//   user_id: string;
//   product: string;
//   history: { role: "user" | "assistant"; content: string }[];
//   ads: unknown[];
//   query: Record<string, unknown> | null;
// }): Promise<{ prompt: string }> {
//   const res = await fetch(`${API_BASE}/api/automations/prompt-builder/consolidate`, {
//     method: "POST",
//     headers: authHeaders({ "Content-Type": "application/json" }),
//     body: JSON.stringify(body),
//   });
//   if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
//   return res.json();
// }

// ── cancelPromptBuilderChat ───────────────────────────────────────────────────
// Best-effort server-side cancel; resolves once acknowledged or on network error.
export async function cancelPromptBuilderChat(jobId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/automations/prompt-builder/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: authHeaders(),
    });
  } catch {
    // Best-effort: ignore network errors on cancel.
  }
}
