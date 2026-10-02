import { PIPELINE_API_BASE } from "./queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TslChatResult = {
  status: "done" | "checkpoint" | "answer";
  script?: string;
  trace?: VerificationTrace;
  checkpoint?: unknown;
  answer?: string;
  revised?: string;
  revisionNote?: string;
};

export type VerificationTrace = {
  gates: Array<{
    id: "G1" | "G2" | "G3" | "G4";
    label: string;
    pass: boolean;
    detail: string;
  }>;
  authority: { score: number; subscores: Record<string, number> };
  sections: Array<{ name: string; present: boolean }>;
  attempts: number;
};

export type TslSendBody = {
  chatId?: string;
  product: string;
  content: string;
  format?: string;
  awarenessLevel?: "unaware" | "problem-aware" | "solution-aware" | "product-aware";
  checkpointAnswer?: { id: string; response: string };
};

export type TslStreamHandlers = {
  onMeta?: (data: { chatId: string; jobId: string; title: string }) => void;
  onDelta?: (text: string) => void;
  onTitle?: (title: string) => void;
  onDone?: (chatId: string) => void;
  onError?: (message: string) => void;
  onCancelled?: () => void;
};

// ── Poll config ───────────────────────────────────────────────────────────────
// Adaptive so quick replies feel quick AND long generations don't hammer the
// server: 500ms for the first 4 polls (handles <2s responses), then 1500ms for
// the next 10, then 3000ms thereafter (up to ~8 minutes).
const POLL_DELAYS_MS = [
  500, 500, 500, 500,
  1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500,
];
const POLL_LONG_DELAY_MS = 3000;
const MAX_POLL_BUDGET_MS = 8 * 60 * 1000; // 8 min — covers worst-case validator regen loop

// ── Auth ──────────────────────────────────────────────────────────────────────
const TOKEN_KEY = "auth_jwt_token";

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── startTslChat ──────────────────────────────────────────────────────────────
// POST /api/tsl/chat → { jobId, chatId }
// Poll GET /api/tsl/chat-jobs/:jobId until status ≠ pending.
// Cancel via POST /api/tsl/chat-jobs/:jobId/cancel.
//
// Returns { abort() } so callers can cancel in-flight polls.
export function startTslChat(
  body: TslSendBody,
  handlers: TslStreamHandlers,
): { abort: () => void } {
  const controller = new AbortController();

  // Fire-and-forget the async loop; errors surface via onError.
  void _run(body, handlers, controller.signal);

  return { abort: () => controller.abort() };
}

// ── attachTslChat ───────────────────────────────────────────────────────────
// Re-attach to an ALREADY-RUNNING job (no POST) and stream its result in. Used
// on a page reload when GET /chats/:id/messages reports an in-flight job, so the
// still-generating reply lands without the user having to reload again.
export function attachTslChat(
  jobId: string,
  chatId: string,
  handlers: TslStreamHandlers,
): { abort: () => void } {
  const controller = new AbortController();
  void _pollJob(jobId, chatId, handlers, controller.signal);
  return { abort: () => controller.abort() };
}

async function _run(
  body: TslSendBody,
  handlers: TslStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const headers = authHeaders();

  // 1. Start the job ──────────────────────────────────────────────────────────
  let startRes: Response;
  try {
    startRes = await fetch(`${PIPELINE_API_BASE}/api/tsl/chat`, {
      method: "POST",
      headers,
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
      if (j?.message) msg = j.message;
      else if (j?.error) msg = j.error;
    } catch {
      try { msg = (await startRes.text()) || msg; } catch { /* ignore */ }
    }
    handlers.onError?.(msg);
    return;
  }

  const startData = (await startRes.json()) as { jobId: string; chatId: string };
  handlers.onMeta?.({
    chatId: startData.chatId,
    jobId: startData.jobId,
    title: "",
  });

  // 2. Poll the job to completion.
  await _pollJob(startData.jobId, startData.chatId, handlers, signal);
}

// Poll GET /api/tsl/chat-jobs/:jobId with adaptive delays until the job reaches a
// terminal status, firing the matching handler. Shared by startTslChat (after the
// POST) and attachTslChat (reload resume).
async function _pollJob(
  jobId: string,
  chatId: string,
  handlers: TslStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const headers = authHeaders();
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
        `${PIPELINE_API_BASE}/api/tsl/chat-jobs/${jobId}`,
        { method: "GET", headers, signal },
      );
    } catch (err: unknown) {
      // Transient network blip — keep polling unless aborted
      if (signal.aborted) return;
      continue;
    }

    if (!pollRes.ok) {
      // 4xx → terminal; 5xx → transient, keep polling
      if (pollRes.status >= 400 && pollRes.status < 500) {
        let msg = `HTTP ${pollRes.status}`;
        try {
          const j = await pollRes.json();
          if (j?.message) msg = j.message;
          else if (j?.error) msg = j.error;
        } catch { /* ignore */ }
        handlers.onError?.(msg);
        return;
      }
      continue;
    }

    const data = (await pollRes.json()) as {
      status: "pending" | "done" | "error" | "cancelled";
      message?: string;
      format?: string;
      result?: TslChatResult;
      error?: string;
      title?: string;
    };

    if (data.status === "error") {
      handlers.onError?.(data.error || "Generation failed");
      return;
    }

    if (data.status === "cancelled") {
      handlers.onCancelled?.();
      return;
    }

    if (data.status === "done") {
      // Emit the finished TslChatResult as a JSON string via onDelta so
      // callers (streamStore) can parse it with parseTslResult.
      const resultPayload = data.result ?? { status: "done" as const, script: data.message };
      handlers.onDelta?.(JSON.stringify(resultPayload));
      if (data.title) handlers.onTitle?.(data.title);
      handlers.onDone?.(chatId);
      return;
    }

    // status === 'pending' → keep polling
  }

  handlers.onError?.("Timed out waiting for response");
}

// ── cancelTslChat ─────────────────────────────────────────────────────────────
// Best-effort cancel; resolves once the server acknowledges or on network error.
export async function cancelTslChat(jobId: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  try {
    await fetch(`${PIPELINE_API_BASE}/api/tsl/chat-jobs/${jobId}/cancel`, {
      method: "POST",
      headers,
    });
  } catch {
    // Best-effort: ignore network errors on cancel
  }
}
