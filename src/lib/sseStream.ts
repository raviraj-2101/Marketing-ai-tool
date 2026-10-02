// Minimal Server-Sent Events client built on `fetch` — Vite + browsers ship
// with TextDecoder/ReadableStream, so we don't add a dependency. Yields one
// parsed event at a time, so the caller can update UI as soon as each event
// arrives. Stays tolerant of CRLF, comment lines (`: ping`), and chunks that
// split an event mid-stream.

export interface SseEvent {
  /** SSE event name (the part after `event:`). Defaults to "message". */
  event: string;
  /** JSON-parsed data, or the raw string if it isn't valid JSON. */
  data: unknown;
}

interface Init {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export async function* readSseStream(url: string, init: Init = {}): AsyncGenerator<SseEvent> {
  const res = await fetch(url, {
    method: init.method ?? "POST",
    headers: { Accept: "text/event-stream", ...(init.headers ?? {}) },
    body: init.body,
    signal: init.signal,
  });
  if (!res.ok || !res.body) {
    // Surface the server's own error body (e.g. a 400 validation message) instead of
    // just the bare status — it becomes the operator-facing generateError.
    let detail = "";
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: string };
        detail = j.error || text;
      } catch {
        detail = text;
      }
    } catch { /* body unavailable — keep the bare status */ }
    throw new Error(`stream HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const parseBlock = (block: string): SseEvent | null => {
    let evName = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) continue; // comment / heartbeat
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") evName = value;
      else if (field === "data") dataLines.push(value);
    }
    if (dataLines.length === 0) return null;
    const raw = dataLines.join("\n");
    let data: unknown;
    try { data = JSON.parse(raw); } catch { data = raw; }
    return { event: evName, data };
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    // Event blocks are separated by a blank line ("\n\n").
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = parseBlock(block);
      if (ev) yield ev;
    }
  }
  // Tail without trailing blank line — drain it as a last event.
  if (buf.trim()) {
    const ev = parseBlock(buf);
    if (ev) yield ev;
  }
}
