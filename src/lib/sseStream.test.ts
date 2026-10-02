import { describe, it, expect, vi } from "vitest";
import { readSseStream } from "./sseStream";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

function mockFetchWith(body: ReadableStream<Uint8Array> | null, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status, body }) as unknown as Response));
}

describe("readSseStream", () => {
  it("parses sequential events split across arbitrary chunk boundaries", async () => {
    mockFetchWith(
      streamFromChunks([
        "event: start\ndata: ",
        '{"total":2}\n\nevent: image\nda',
        'ta: {"done":1}\n\n',
        "event: image\ndata: {\"done\":2}\n\nevent: done\ndata: {}\n\n",
      ]),
    );
    const events = [];
    for await (const e of readSseStream("/x", { body: "{}" })) events.push(e);
    expect(events.map((e) => e.event)).toEqual(["start", "image", "image", "done"]);
    expect(events[0].data).toEqual({ total: 2 });
    expect(events[1].data).toEqual({ done: 1 });
    expect(events[2].data).toEqual({ done: 2 });
  });

  it("ignores comment heartbeats (`: ping`) and blank lines", async () => {
    mockFetchWith(streamFromChunks([": ping\n\nevent: image\ndata: {\"done\":1}\n\n: ping\n\n"]));
    const evs = [];
    for await (const e of readSseStream("/x")) evs.push(e);
    expect(evs).toHaveLength(1);
    expect(evs[0].event).toBe("image");
  });

  it("falls back to raw string when data isn't JSON", async () => {
    mockFetchWith(streamFromChunks(["event: msg\ndata: hello world\n\n"]));
    const evs = [];
    for await (const e of readSseStream("/x")) evs.push(e);
    expect(evs[0].data).toBe("hello world");
  });

  it("throws on non-OK HTTP status", async () => {
    mockFetchWith(null, false, 500);
    await expect(async () => {
      for await (const _ of readSseStream("/x")) { /* unreachable */ }
    }).rejects.toThrow(/HTTP 500/);
  });

  it("yields a trailing event even when the stream ends without a blank line", async () => {
    mockFetchWith(streamFromChunks(["event: done\ndata: {\"ok\":true}"]));
    const evs = [];
    for await (const e of readSseStream("/x")) evs.push(e);
    expect(evs).toEqual([{ event: "done", data: { ok: true } }]);
  });
});
