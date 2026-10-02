import { API_BASE } from "./queryClient";

export type StreamHandlers = {
  onMeta?: (data: { chatId: string; title: string; jobId: string }) => void;
  onDelta?: (text: string) => void;
  onTitle?: (title: string) => void;
  onDone?: (data: { chatId: string }) => void;
  onError?: (message: string) => void;
  onCancelled?: () => void;
};

const TOKEN_KEY = "auth_jwt_token";

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Async pattern: POST starts a job, then we poll until done.
// This avoids the ~100s Cloudflare proxy timeout for long Anthropic generations.
//
// Polling is adaptive so quick replies feel quick AND long generations don't
// hammer the server: 500ms for the first 4 polls (handles <2s responses),
// then 1500ms for the next 10, then 3000ms thereafter (up to ~8 minutes).
const POLL_DELAYS_MS = [500, 500, 500, 500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500];
const POLL_LONG_DELAY_MS = 3000;
const MAX_POLL_BUDGET_MS = 8 * 60 * 1000; // 8 min — covers worst-case validator regen loop

export async function streamChat(
  body: {
    chatId?: string;
    product: string;
    content: string;
    lengthScope?: "under60s" | "above60s";
    format?: string;
    userId?: string;
    // Optional format slug. Currently supports:
    //   "00-classic-ugc-under-60s" (default — behaves identical to before)
    //   "05-classic-ugc-1-to-4min" (rolls a random 60-240s duration on each turn)
    format?: string;
    // Optional per-request CTA type. When set, the backend injects a directive
    // forcing the closing CTA to be ONLY this type. Omitted => skill.md default.
    ctaType?: "quiz" | "money-back" | "offer";
    // Optional per-message "With hook". When true the backend injects a directive
    // asking for a short spoken hook above the normal script (formats
    // 00/05/06/07 only). Omitted => today's behaviour, byte-identical request.
    withHook?: boolean;
  },
  handlers: StreamHandlers,
  signal?: AbortSignal,
) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Map to image-builder's expected field names
  const requestBody: Record<string, unknown> = {
    chat_id: body.chatId,
    product: body.product,
    message: body.content,
    length_scope: body.lengthScope || "under60s",
    // Script format (Classic / Comparison TOF / Comparison BOF). Omitted-safe:
    // image-builder defaults to "00-classic-ugc-under-60s" when absent.
    format: body.format || "00-classic-ugc-under-60s",
    user_id: body.userId,
  };
  if (body.format) requestBody.format = body.format;
  // Only send cta_type when the user explicitly picked one — omitting it keeps
  // the backend on its default (no CTA directive, skill.md decides).
  if (body.ctaType) requestBody.cta_type = body.ctaType;
  // Same rule for the hook: only send with_hook when the user ticked it, so an
  // unticked request is byte-identical to what we send today.
  if (body.withHook) requestBody.with_hook = true;

  // 1. Start the job
  let startRes: Response;
  try {
    startRes = await fetch(`${API_BASE}/api/ugc/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (err: any) {
    handlers.onError?.(err?.message || "Network error");
    return;
  }

  if (!startRes.ok) {
    let msg = `HTTP ${startRes.status}`;
    try {
      const j = await startRes.json();
      if (j?.message) msg = j.message;
      else if (j?.error) msg = j.error;
    } catch {
      try {
        msg = (await startRes.text()) || msg;
      } catch {}
    }
    handlers.onError?.(msg);
    return;
  }

  const startData = (await startRes.json()) as {
    jobId: string;
    chatId: string;
    title?: string;
  };
  handlers.onMeta?.({
    chatId: startData.chatId,
    title: startData.title || "",
    jobId: startData.jobId,
  });

  // 2. Poll the job status with adaptive delays.
  const startedAt = Date.now();
  let pollIdx = 0;
  while (Date.now() - startedAt < MAX_POLL_BUDGET_MS) {
    if (signal?.aborted) return;
    const delay = pollIdx < POLL_DELAYS_MS.length ? POLL_DELAYS_MS[pollIdx] : POLL_LONG_DELAY_MS;
    await new Promise((r) => setTimeout(r, delay));
    pollIdx++;

    let pollRes: Response;
    try {
      pollRes = await fetch(
        `${API_BASE}/api/ugc/jobs/${startData.jobId}`,
        { method: "GET", headers, signal },
      );
    } catch (err: any) {
      if (signal?.aborted) return;
      continue;
    }

    if (!pollRes.ok) {
      if (pollRes.status >= 400 && pollRes.status < 500) {
        let msg = `HTTP ${pollRes.status}`;
        try {
          const j = await pollRes.json();
          if (j?.message) msg = j.message;
          else if (j?.error) msg = j.error;
        } catch {}
        handlers.onError?.(msg);
        return;
      }
      continue;
    }

    const data = (await pollRes.json()) as {
      status: "pending" | "done" | "error" | "cancelled";
      chatId?: string;
      title?: string;
      message?: string;
      error?: string;
    };

    if (data.status === "error") {
      if (data.title) handlers.onTitle?.(data.title);
      handlers.onError?.(data.error || "Generation failed");
      return;
    }

    if (data.status === "cancelled") {
      handlers.onCancelled?.();
      return;
    }

    if (data.status === "done") {
      handlers.onDelta?.(data.message || "");
      handlers.onTitle?.(data.title || "");
      handlers.onDone?.({ chatId: data.chatId || startData.chatId });
      return;
    }
    // status === 'pending' → keep polling
  }

  handlers.onError?.("Timed out waiting for response");
}
