// TSL Chat — Generate Scripts page.
//
// Hybrid: DashboardLayout outer shell from ScriptChat + chat-list sidebar with
// rename/delete, and chat area ported pixel-faithfully from the standalone
// tsl-scripts-16june/client/src/pages/chat.tsx.
//
// Adapters vs the standalone:
//   1. react-router-dom (useParams/useNavigate/Link) instead of wouter.
//   2. useAuth() (tokens live in localStorage; the lib reads them itself).
//   3. /api/tsl/* endpoints + PIPELINE_API_BASE via pipelineQueryFn.
//   4. DashboardLayout + chat-list sidebar with per-chat rename + delete.
//   5. Co-work checkpoints are DORMANT (autopilot only) — no CheckpointCard.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ArrowUp,
  Sparkles,
  Square,
  Plus,
  MessageSquare,
  PanelRightOpen,
  PanelRightClose,
  ArrowDown,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pipelineQueryFn, pipelineApiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { fmtLocalTime } from "@/lib/tslDatetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { startTslChat, cancelTslChat, attachTslChat } from "@/lib/tslStreamChat";
import {
  type LocalMessage,
  getStream,
  setStream,
  updateMessages,
  rekey,
  clearStream,
} from "@/lib/tslStreamStore";
import { useTslChatStream } from "@/lib/useTslChatStream";
import {
  parseTslResult,
  isFinishedTsl,
  isNonScriptResponse,
  resolveFormatMeta,
} from "@/lib/tslResult";
import { TslDocsPanel, TslDocsPanelMobile } from "@/components/tsl/TslDocsPanel";

// ── Types ────────────────────────────────────────────────────────────────────
interface ProductSummary {
  id: string;
  name: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: number;
}

interface ChatPayload {
  chat: { id: string; title: string; product: string; format?: string };
  messages: ChatMessage[];
  // Present + pending when a generation is still running server-side (lets a
  // reloaded client re-attach its poller instead of stalling on the user bubble).
  activeJob?: { id: string; status: string } | null;
}

interface ChatListItem {
  id: string;
  title: string;
  product: string;
  updated_at: number;
}

type FormatsResponse = {
  formats: ReadonlyArray<{ id: string; name: string; description: string }>;
  default: string;
};

// Stable pending key for a brand-new chat before the server returns its id.
const PENDING_KEY = "pending:new-chat";

const MAX_INPUT_CHARS = 50000;

const formatStamp = (ts?: number): string => fmtLocalTime(ts);

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── AutoGrowTextarea ─────────────────────────────────────────────────────────
const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    "data-testid"?: string;
  }
>(function AutoGrowTextarea(props, externalRef) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(externalRef, () => internalRef.current as HTMLTextAreaElement);
  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [props.value]);
  return (
    <textarea
      ref={internalRef}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={props.onKeyDown}
      placeholder={props.placeholder}
      disabled={props.disabled}
      className={`w-full block outline-none ${props.className || ""}`}
      data-testid={props["data-testid"]}
      rows={1}
    />
  );
});

// ───────────────────────────────────────────────────────────────────────────
export default function TslChatPage() {
  const params = useParams<{ chatId?: string }>();
  const chatId = params.chatId;
  const qc = useQueryClient();
  const navigate = useNavigate();

  // ── Server-side data ──────────────────────────────────────────────────────
  const productsQ = useQuery<ProductSummary[]>({
    queryKey: ["/api/tsl/products"],
    queryFn: pipelineQueryFn,
  });

  const chatsQ = useQuery<ChatListItem[]>({
    queryKey: ["/api/tsl/chats"],
    queryFn: pipelineQueryFn,
    refetchInterval: 30000,
  });

  const chatQ = useQuery<ChatPayload>({
    queryKey: chatId ? [`/api/tsl/chats/${chatId}/messages`] : ["tsl-no-chat"],
    queryFn: pipelineQueryFn,
    enabled: !!chatId,
  });

  // ── Format list ────────────────────────────────────────────────────────────
  const formatsQ = useQuery<FormatsResponse>({
    queryKey: ["/api/tsl/formats"],
    queryFn: pipelineQueryFn,
  });
  const formatObjs = formatsQ.data?.formats ?? [];
  const DEFAULT_FORMAT = formatsQ.data?.default ?? formatObjs[0]?.id ?? "";
  const nameOf = useCallback(
    (id: string) => formatObjs.find((f) => f.id === id)?.name ?? id,
    [formatObjs],
  );

  const [product, setProduct] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [input, setInput] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Default the format selection once the list loads (new chats only).
  useEffect(() => {
    if (!format && DEFAULT_FORMAT) setFormat(DEFAULT_FORMAT);
  }, [DEFAULT_FORMAT, format]);

  // ── Stream-store view key + live state ──────────────────────────────────────
  const pendingStream = useTslChatStream(PENDING_KEY);
  const viewKey: string | null =
    chatId ?? (pendingStream ? PENDING_KEY : null);
  const streamState = useTslChatStream(viewKey);
  const liveMessages = streamState?.messages ?? [];
  const streaming = !!streamState?.streaming;

  // Auto-focus composer on mount + chat switch.
  useEffect(() => {
    const el = composerRef.current;
    if (!el || el.disabled) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;
    el.focus({ preventScroll: true });
  }, [viewKey]);

  // Track the product for new-chat sends from the loaded chat.
  useEffect(() => {
    if (chatQ.data?.chat.product) setProduct(chatQ.data.chat.product);
  }, [chatQ.data?.chat.product]);

  // Sync server messages into the per-chat store (never wipe an in-flight stream).
  useEffect(() => {
    if (!chatQ.data || !chatId) return;
    const cur = getStream(chatId);
    if (cur?.streaming) return;
    setStream(chatId, {
      messages: chatQ.data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
      streaming: false,
      abort: null,
    });
    const storedProduct = chatQ.data.chat.product;
    if (storedProduct) setProduct(storedProduct);
    // Re-hydrate the chat's locked format from the server record. Without this,
    // `format` stays at its default on a directly-opened/reloaded chat, so the
    // header shows the wrong format AND every follow-up (revise / question)
    // sends the wrong/empty format — which makes the backend either run the
    // revision under the wrong required-section spine, or (when empty) re-pin
    // "auto" from the follow-up text. Mirrors ScriptChat's format re-hydration.
    const storedFormat = chatQ.data.chat.format;
    if (typeof storedFormat === "string" && storedFormat) setFormat(storedFormat);
  }, [chatQ.data, chatId]);

  // ── Resume an in-flight generation after a page reload ──────────────────────
  // When the chat-load query reports a still-pending job AND we don't already
  // have a live stream for this chat AND the last persisted message is an
  // unanswered user turn, append a streaming placeholder and re-attach the
  // poller so the reply lands without a second reload. Handlers mirror onSend's
  // (liveKey = chatId). The poller intentionally keeps running if the user
  // navigates away (it writes to this chat's store key), same as a live send.
  const resumeAttachedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!chatId || !chatQ.data) return;
    const active = chatQ.data.activeJob;
    if (!active || active.status !== "pending") return;
    if (resumeAttachedRef.current === active.id) return; // already attached to this job

    const cur = getStream(chatId);
    if (cur?.streaming) return; // a live stream is already running (e.g. started this session)

    const msgs = chatQ.data.messages;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "user") return; // nothing awaiting a reply

    resumeAttachedRef.current = active.id;

    const now = Date.now();
    const placeholder: LocalMessage = {
      id: `resume-asst-${active.id}`,
      role: "assistant",
      content: "",
      streaming: true,
      awaitingFirstByte: true,
      startedAt: now,
      createdAt: now,
    };
    setStream(chatId, (prev) => ({
      messages: [
        ...(prev?.messages ??
          msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          }))),
        placeholder,
      ],
      streaming: true,
      abort: null,
      jobId: active.id,
    }));

    const { abort } = attachTslChat(active.id, chatId, {
      onDelta: (delta) => {
        updateMessages(chatId, (prev) => {
          const copy = [...prev];
          const lastM = copy[copy.length - 1];
          if (lastM && lastM.role === "assistant") {
            copy[copy.length - 1] = { ...lastM, content: delta, awaitingFirstByte: false };
          }
          return copy;
        });
      },
      onTitle: () => {
        qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
      },
      onDone: () => {
        updateMessages(chatId, (prev) =>
          prev.map((m) =>
            m.streaming ? { ...m, streaming: false, finishedAt: Date.now() } : m,
          ),
        );
        setStream(chatId, (prev) => ({
          messages: prev?.messages ?? [],
          streaming: false,
          abort: null,
          jobId: null,
        }));
        qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
        qc.invalidateQueries({ queryKey: [`/api/tsl/chats/${chatId}/messages`] });
      },
      onError: (msg) => {
        updateMessages(chatId, (prev) => {
          const copy = [...prev];
          const lastM = copy[copy.length - 1];
          if (lastM && lastM.role === "assistant") {
            copy[copy.length - 1] = {
              ...lastM,
              content: JSON.stringify({ status: "answer", answer: `⚠️ ${msg}` }),
              streaming: false,
              awaitingFirstByte: false,
              finishedAt: Date.now(),
            };
          }
          return copy;
        });
        setStream(chatId, (prev) => ({
          messages: prev?.messages ?? [],
          streaming: false,
          abort: null,
          jobId: null,
        }));
      },
      onCancelled: () => {
        updateMessages(chatId, (prev) =>
          prev.map((m) =>
            m.streaming
              ? {
                  ...m,
                  streaming: false,
                  awaitingFirstByte: false,
                  finishedAt: Date.now(),
                  content:
                    m.content ||
                    JSON.stringify({ status: "answer", answer: "_(stopped)_" }),
                }
              : m,
          ),
        );
        setStream(chatId, (prev) => ({
          messages: prev?.messages ?? [],
          streaming: false,
          abort: null,
          jobId: null,
        }));
      },
    });

    setStream(chatId, (prev) => ({
      messages: prev?.messages ?? [],
      streaming: true,
      abort: { abort } as unknown as AbortController,
      jobId: active.id,
    }));
  }, [chatId, chatQ.data, qc]);

  // ── Scroll intent + auto-follow ────────────────────────────────────────────
  const [autoFollow, setAutoFollow] = useState(true);
  const [showJumpPill, setShowJumpPill] = useState(false);
  const autoFollowRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const userScrolledRef = useRef(false);
  const streamingRef = useRef(streaming);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const setScrollRef = useCallback((node: HTMLDivElement | null) => setScrollEl(node), []);
  const [bottomSentinelEl, setBottomSentinelEl] = useState<HTMLDivElement | null>(null);
  const setBottomSentinelRef = useCallback(
    (node: HTMLDivElement | null) => setBottomSentinelEl(node),
    [],
  );

  // Reset scroll intent when navigating between chats.
  useEffect(() => {
    userScrolledRef.current = false;
    autoFollowRef.current = true;
    setAutoFollow(true);
    setShowJumpPill(false);
  }, [chatId]);

  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const handleUserIntent = () => {
      if (programmaticScrollRef.current) return;
      if (autoFollowRef.current) {
        userScrolledRef.current = true;
        autoFollowRef.current = false;
        setAutoFollow(false);
        if (streamingRef.current) setShowJumpPill(true);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const intentKeys = ["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End", " "];
      if (intentKeys.includes(e.key)) handleUserIntent();
    };
    el.addEventListener("wheel", handleUserIntent, { passive: true });
    el.addEventListener("touchstart", handleUserIntent, { passive: true });
    el.addEventListener("touchmove", handleUserIntent, { passive: true });
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", handleUserIntent);
      el.removeEventListener("touchstart", handleUserIntent);
      el.removeEventListener("touchmove", handleUserIntent);
      el.removeEventListener("keydown", onKey);
    };
  }, [scrollEl]);

  useEffect(() => {
    if (!scrollEl || !bottomSentinelEl) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          userScrolledRef.current = false;
          autoFollowRef.current = true;
          setAutoFollow(true);
          setShowJumpPill(false);
        } else if (streamingRef.current && userScrolledRef.current) {
          setShowJumpPill(true);
        }
      },
      { root: scrollEl, threshold: 0, rootMargin: "0px 0px -1px 0px" },
    );
    obs.observe(bottomSentinelEl);
    return () => obs.disconnect();
  }, [scrollEl, bottomSentinelEl]);

  useEffect(() => {
    if (!autoFollowRef.current || userScrolledRef.current) return;
    const el = scrollEl;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom > 80 && liveMessages.length > 1) {
      userScrolledRef.current = true;
      autoFollowRef.current = false;
      setAutoFollow(false);
      if (streamingRef.current) setShowJumpPill(true);
      return;
    }
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  }, [liveMessages, scrollEl]);

  const jumpToLatest = () => {
    const el = scrollEl;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    userScrolledRef.current = false;
    autoFollowRef.current = true;
    setAutoFollow(true);
    setShowJumpPill(false);
    setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 400);
  };

  // ── Rename + delete mutations ─────────────────────────────────────────────
  const renameMut = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await pipelineApiRequest("PATCH", `/api/tsl/chats/${id}`, { title });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await pipelineApiRequest("DELETE", `/api/tsl/chats/${id}`);
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
      if (chatId === id) navigate("/tsl-builder/generate-scripts", { replace: true });
    },
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  // ── Send a message ─────────────────────────────────────────────────────────
  const onSend = useCallback(
    (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text) return;
      const slug = chatQ.data?.chat.product || product;
      if (!slug) return;

      const startKey = chatId ?? PENDING_KEY;
      const cur = getStream(startKey);
      if (cur?.streaming) return;

      const wasNewChat = !chatId;
      if (overrideText === undefined) setInput("");
      userScrolledRef.current = false;
      autoFollowRef.current = true;
      setAutoFollow(true);
      setShowJumpPill(false);

      const now = Date.now();
      const userMsg: LocalMessage = {
        id: `local-user-${now}`,
        role: "user",
        content: text,
        createdAt: now,
      };
      const assistantMsg: LocalMessage = {
        id: `local-asst-${now}`,
        role: "assistant",
        content: "",
        format: format || null,
        streaming: true,
        awaitingFirstByte: true,
        startedAt: now,
        createdAt: now,
      };

      setStream(startKey, (prev) => ({
        messages: [...(prev?.messages ?? []), userMsg, assistantMsg],
        streaming: true,
        abort: null,
      }));

      let liveKey = startKey;
      let activeChatId = chatId;

      const { abort } = startTslChat(
        {
          chatId: chatId || undefined,
          product: slug,
          content: text,
          format: format || undefined,
        },
        {
          onMeta: (meta) => {
            activeChatId = meta.chatId;
            setStream(liveKey, (prev) => ({
              messages: prev?.messages ?? [],
              streaming: true,
              abort: prev?.abort ?? null,
              jobId: meta.jobId,
            }));
            if (liveKey !== meta.chatId) {
              rekey(liveKey, meta.chatId);
              liveKey = meta.chatId;
            }
            if (wasNewChat) {
              navigate(`/tsl-builder/generate-scripts/${meta.chatId}`, {
                replace: true,
              });
            }
            qc.setQueryData<ChatListItem[]>(["/api/tsl/chats"], (prevList) => {
              const list = prevList ?? [];
              if (list.some((c) => c.id === meta.chatId)) return list;
              const ts = Date.now();
              const optimistic: ChatListItem = {
                id: meta.chatId,
                title: meta.title || "New chat",
                product: slug,
                updated_at: ts,
              };
              return [optimistic, ...list];
            });
          },
          onDelta: (delta) => {
            updateMessages(liveKey, (prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: delta,
                  awaitingFirstByte: false,
                };
              }
              return copy;
            });
          },
          onTitle: () => {
            qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
          },
          onDone: (doneChatId) => {
            updateMessages(liveKey, (prev) =>
              prev.map((m) =>
                m.streaming
                  ? { ...m, streaming: false, finishedAt: Date.now() }
                  : m,
              ),
            );
            setStream(liveKey, (prev) => ({
              messages: prev?.messages ?? [],
              streaming: false,
              abort: null,
              jobId: null,
            }));
            qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
            const cid = doneChatId || activeChatId;
            if (cid) {
              qc.invalidateQueries({
                queryKey: [`/api/tsl/chats/${cid}/messages`],
              });
            }
          },
          onError: (msg) => {
            updateMessages(liveKey, (prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: JSON.stringify({
                    status: "answer",
                    answer: `⚠️ ${msg}`,
                  }),
                  streaming: false,
                  awaitingFirstByte: false,
                  finishedAt: Date.now(),
                };
              }
              return copy;
            });
            setStream(liveKey, (prev) => ({
              messages: prev?.messages ?? [],
              streaming: false,
              abort: null,
              jobId: null,
            }));
          },
          onCancelled: () => {
            updateMessages(liveKey, (prev) =>
              prev.map((m) =>
                m.streaming
                  ? {
                      ...m,
                      streaming: false,
                      awaitingFirstByte: false,
                      finishedAt: Date.now(),
                      content:
                        m.content ||
                        JSON.stringify({ status: "answer", answer: "_(stopped)_" }),
                    }
                  : m,
              ),
            );
            setStream(liveKey, (prev) => ({
              messages: prev?.messages ?? [],
              streaming: false,
              abort: null,
              jobId: null,
            }));
            if (liveKey === PENDING_KEY) clearStream(PENDING_KEY);
          },
        },
      );

      setStream(liveKey, (prev) => ({
        messages: prev?.messages ?? [],
        streaming: true,
        abort: { abort } as unknown as AbortController,
      }));
    },
    [input, product, chatId, format, chatQ.data?.chat.product, navigate, qc],
  );

  const stopGeneration = useCallback(() => {
    if (!viewKey) return;
    const cur = getStream(viewKey);
    if (cur?.jobId) void cancelTslChat(cur.jobId);
    cur?.abort?.abort();
    updateMessages(viewKey, (prev) =>
      prev.map((m) =>
        m.streaming
          ? {
              ...m,
              streaming: false,
              awaitingFirstByte: false,
              finishedAt: Date.now(),
              content:
                m.content ||
                JSON.stringify({ status: "answer", answer: "_(stopped)_" }),
            }
          : m,
      ),
    );
    setStream(viewKey, (prev) => ({
      messages: prev?.messages ?? [],
      streaming: false,
      abort: null,
      jobId: null,
    }));
    if (viewKey === PENDING_KEY) clearStream(PENDING_KEY);
  }, [viewKey]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // ── Docs-panel state ────────────────────────────────────────────────────────
  const latestAssistantMessage = useMemo(() => {
    for (let i = liveMessages.length - 1; i >= 0; i--) {
      if (liveMessages[i].role === "assistant") return liveMessages[i];
    }
    return undefined;
  }, [liveMessages]);

  const finishedMessages = useMemo(
    () =>
      liveMessages.filter(
        (m) => m.role === "assistant" && isFinishedTsl(m.content),
      ),
    [liveMessages],
  );

  const [selectedDocsMessageId, setSelectedDocsMessageId] = useState<
    string | null
  >(null);
  useEffect(() => {
    setSelectedDocsMessageId(null);
  }, [finishedMessages.length, viewKey]);

  const docsMessage = useMemo(() => {
    if (selectedDocsMessageId) {
      const found = finishedMessages.find((m) => m.id === selectedDocsMessageId);
      if (found) return found;
    }
    return finishedMessages[finishedMessages.length - 1] || latestAssistantMessage;
  }, [finishedMessages, selectedDocsMessageId, latestAssistantMessage]);

  const hasFinishedScript = useMemo(
    () => isFinishedTsl(docsMessage?.content),
    [docsMessage?.content],
  );

  const [docsOpen, setDocsOpen] = useState(false);
  const autoOpenedForMsgId = useRef<string | null>(null);
  useEffect(() => {
    setDocsOpen(false);
    autoOpenedForMsgId.current = null;
  }, [viewKey]);
  useEffect(() => {
    if (!latestAssistantMessage || !hasFinishedScript) return;
    if (autoOpenedForMsgId.current === latestAssistantMessage.id) return;
    autoOpenedForMsgId.current = latestAssistantMessage.id;
    setDocsOpen(true);
  }, [latestAssistantMessage?.id, hasFinishedScript]);

  // ── Derived view bits ───────────────────────────────────────────────────────
  const products = productsQ.data || [];
  const chats = chatsQ.data || [];
  const productLabel =
    products.find((p) => p.id === product)?.name ?? product;
  const formatMeta = format ? resolveFormatMeta(format) : null;

  return (
    <DashboardLayout>
      <div className="flex h-full w-full overflow-hidden bg-background">
        {/* ── Left chat-list sidebar (ScriptChat shell style + rename/delete) ── */}
        <aside className="flex flex-col h-full w-72 border-r border-border bg-background shrink-0">
          <div className="p-3 border-b border-border">
            <Link
              to="/tsl-builder/generate-scripts"
              className="inline-flex items-center justify-start gap-2 w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 hover:opacity-90 transition-opacity"
              data-testid="button-new-chat"
            >
              <Plus className="size-4" />
              New chat
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {chats.length === 0 ? (
              <div className="text-sm text-muted-foreground px-2 py-4">
                No chats yet. Pick a product and start one.
              </div>
            ) : (
              chats.map((c) => {
                const isSelected = c.id === chatId;
                const isRenaming = renamingId === c.id;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className={`group rounded-md px-2 py-1.5 flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      if (!isRenaming) navigate(`/tsl-builder/generate-scripts/${c.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (isRenaming) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/tsl-builder/generate-scripts/${c.id}`);
                      }
                    }}
                    data-testid={`chat-item-${c.id}`}
                  >
                    <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                    {isRenaming ? (
                      <div
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Input
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && draftTitle.trim()) {
                              renameMut.mutate({ id: c.id, title: draftTitle.trim() });
                              setRenamingId(null);
                            } else if (e.key === "Escape") {
                              setRenamingId(null);
                            }
                          }}
                          className="h-7 text-sm"
                          data-testid={`input-rename-${c.id}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          onClick={() => {
                            if (draftTitle.trim()) {
                              renameMut.mutate({ id: c.id, title: draftTitle.trim() });
                              setRenamingId(null);
                            }
                          }}
                          data-testid={`button-confirm-rename-${c.id}`}
                        >
                          <Check className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0"
                          onClick={() => setRenamingId(null)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div
                            className="truncate text-sm font-medium"
                            data-testid={`text-chat-title-${c.id}`}
                          >
                            {c.title}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {products.find((p) => p.id === c.product)?.name ?? c.product}
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            onClick={() => {
                              setRenamingId(c.id);
                              setDraftTitle(c.title ?? "");
                            }}
                            data-testid={`button-rename-${c.id}`}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6 text-destructive"
                                data-testid={`button-delete-${c.id}`}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{c.title}" and all its messages will be permanently removed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMut.mutate(c.id)}
                                  data-testid={`button-confirm-delete-${c.id}`}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Main pane: header + messages + composer ── */}
        <main className="flex-1 min-w-0 flex flex-col h-full relative overflow-hidden">
          {streaming && (
            <div
              className="absolute top-0 left-0 right-0 h-0.5 z-20 overflow-hidden bg-primary/10 pointer-events-none"
              aria-hidden="true"
            >
              <div className="h-full w-1/3 bg-primary animate-progress-sweep motion-reduce:animate-none" />
            </div>
          )}

          {/* Header — product · format · panel toggle */}
          <header className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 border-b border-border/60 bg-card/40 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="size-4 text-muted-foreground/70 shrink-0" />
              <span
                className="text-[13.5px] font-semibold tracking-tight truncate"
                data-testid="text-header-title"
              >
                {chatQ.data?.chat?.title || (chatId ? "Chat" : "New TSL")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Product selector — disabled once a chat exists */}
              <Select
                value={product}
                onValueChange={setProduct}
                disabled={!!chatId}
              >
                <SelectTrigger className="w-[180px] h-9" data-testid="select-product">
                  <SelectValue placeholder="Product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Format toggle — locked once a chat exists */}
              {!chatId ? (
                <Select
                  value={format}
                  onValueChange={setFormat}
                  disabled={formatObjs.length === 0}
                >
                  <SelectTrigger className="w-[230px] h-9" data-testid="select-format">
                    <span className="truncate text-left">
                      {format ? nameOf(format) : "Format"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-w-[360px]">
                    {formatObjs.map((f) => (
                      <SelectItem key={f.id} value={f.id} className="py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium leading-snug">{f.name}</span>
                          <span className="text-[11px] text-muted-foreground leading-snug whitespace-normal">
                            {f.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 h-9 px-2.5 text-[11.5px] font-medium text-muted-foreground"
                  title="Format locked at chat creation"
                  data-testid="format-locked"
                >
                  <span className="text-foreground truncate max-w-[200px]">
                    {nameOf(format)}
                  </span>
                </span>
              )}

              {chatId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDocsOpen((v) => !v)}
                  className="h-9 gap-1.5"
                  data-testid="button-toggle-docs"
                  title={docsOpen ? "Close TSL panel" : "Open TSL panel"}
                >
                  {docsOpen ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                  <span className="hidden sm:inline">{docsOpen ? "Close" : "Panel"}</span>
                </Button>
              )}
            </div>
          </header>

          {/* Messages */}
          <div ref={setScrollRef} tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
            {liveMessages.length === 0 ? (
              <EmptyState
                productLabel={productLabel}
                formatName={formatMeta?.name}
                onPick={(s) => setInput(s)}
              />
            ) : (
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
                {liveMessages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onOpenDocs={() => setDocsOpen(true)}
                  />
                ))}
              </div>
            )}
            <div ref={setBottomSentinelRef} aria-hidden="true" className="h-px w-full" />
          </div>

          {showJumpPill && streaming && !autoFollow && (
            <button
              onClick={jumpToLatest}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-lg hover:opacity-90 transition"
              data-testid="button-jump-latest"
            >
              <ArrowDown className="size-4" />
              <span>Jump to latest</span>
            </button>
          )}

          {/* Composer */}
          <div className="border-t border-border bg-background">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
              <div
                className={`relative rounded-2xl border bg-card shadow-sm focus-within:shadow-md transition-all duration-150 ${
                  input.length > MAX_INPUT_CHARS
                    ? "border-destructive/60 focus-within:border-destructive focus-within:ring-2 focus-within:ring-destructive/15"
                    : "border-input focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15"
                }`}
              >
                <AutoGrowTextarea
                  value={input}
                  onChange={setInput}
                  onKeyDown={onKeyDown}
                  disabled={streaming}
                  placeholder={
                    streaming
                      ? "Generating… (send unlocks once the reply finishes)"
                      : "Describe the angle or story — or ask about the formats…  (Enter to send)"
                  }
                  className="resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[52px] max-h-[40vh] pr-14 pl-4 py-3.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/70"
                  data-testid="input-composer"
                  ref={composerRef}
                />
                <div className="absolute bottom-2 right-2 z-10">
                  {streaming ? (
                    <Button
                      size="icon"
                      variant="default"
                      className="size-9 rounded-full shadow-sm hover:scale-[1.03] active:scale-95 transition-transform motion-reduce:transition-none motion-reduce:hover:scale-100"
                      onClick={stopGeneration}
                      data-testid="button-stop"
                      aria-label="Stop generating"
                      title="Stop generating"
                    >
                      <Square className="size-3.5 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="size-9 rounded-full shadow-sm enabled:ring-2 enabled:ring-primary/25 hover:scale-[1.03] active:scale-95 transition-transform motion-reduce:transition-none motion-reduce:hover:scale-100 disabled:opacity-40 disabled:hover:scale-100"
                      onClick={() => onSend()}
                      disabled={!input.trim() || input.length > MAX_INPUT_CHARS || (!chatId && !product)}
                      data-testid="button-send"
                      aria-label="Send"
                      title="Send · Enter"
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <p className="text-[11px] text-muted-foreground/70">
                  Internal Acentecom tool · Auto-pilot mode
                </p>
                {input.length > MAX_INPUT_CHARS * 0.6 && (
                  <p
                    className={`text-[11px] tabular-nums ${
                      input.length > MAX_INPUT_CHARS
                        ? "text-destructive font-medium"
                        : input.length > MAX_INPUT_CHARS * 0.9
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground/70"
                    }`}
                    data-testid="text-char-count"
                  >
                    {input.length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                    {input.length > MAX_INPUT_CHARS && " — too long"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Desktop right-rail panel */}
        <TslDocsPanel
          message={docsMessage}
          finishedMessages={finishedMessages}
          selectedMessageId={selectedDocsMessageId}
          onSelectMessage={setSelectedDocsMessageId}
          open={docsOpen}
          onClose={() => setDocsOpen(false)}
          productLabel={productLabel}
        />
        {/* Mobile full-screen sheet */}
        <TslDocsPanelMobile
          message={docsMessage}
          finishedMessages={finishedMessages}
          selectedMessageId={selectedDocsMessageId}
          onSelectMessage={setSelectedDocsMessageId}
          open={docsOpen}
          onClose={() => setDocsOpen(false)}
          productLabel={productLabel}
        />
      </div>
    </DashboardLayout>
  );
}

// ── Empty state (standalone chat.tsx pixel-faithful) ─────────────────────────
function EmptyState({
  productLabel,
  formatName,
  onPick,
}: {
  productLabel: string;
  formatName?: string;
  onPick: (s: string) => void;
}) {
  const suggestions = [
    "A woman starved herself to win back her husband's attention and nearly died.",
    "Give me 5 hooks for the same angle.",
    "What formats do we have?",
    "What makes a TSL convert?",
  ];
  return (
    <div className="h-full flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 size-[28rem] rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />
      <div className="relative max-w-2xl text-center">
        <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary mx-auto flex items-center justify-center mb-5 shadow-lg shadow-primary/10">
          <Sparkles className="size-6" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm px-3 py-0.5 text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          {productLabel || "Pick a product"}
          {formatName && <span className="text-foreground/70">· {formatName}</span>}
          <span className="text-foreground/70">· AUTO-PILOT</span>
        </div>
        <h2
          className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2"
          data-testid="text-empty-title"
        >
          Write a winning TSL
        </h2>
        <p className="text-[13.5px] text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
          Drop a vague angle or a story idea. The engine builds it section-by-section
          against your chosen proven format, scores it on the authority rubric, and
          only ever hands back a winner — Meta-formatted, ready to paste.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="group rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm px-4 py-3 text-[13px] hover:bg-card hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all motion-reduce:transition-none motion-reduce:hover:translate-y-0 text-left cursor-pointer relative overflow-hidden"
              data-testid={`suggestion-${s.slice(0, 20)}`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative">{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({
  message,
  onOpenDocs,
}: {
  message: LocalMessage;
  onOpenDocs?: () => void;
}) {
  const isUser = message.role === "user";

  const ts = message.createdAt ?? message.finishedAt ?? message.startedAt;

  return (
    <div
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} group`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      {!isUser && (
        <div className="size-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-sm font-semibold">
          A
        </div>
      )}
      <div
        className={`relative px-4 py-3 max-w-[88%] rounded-2xl ${
          isUser ? "bg-primary text-primary-foreground" : "bg-card border border-card-border w-full"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : message.streaming && !message.content ? (
          <ThinkingState startedAt={message.startedAt} />
        ) : (
          <AssistantBody message={message} onOpenDocs={onOpenDocs} />
        )}
        {(() => {
          if ((message.streaming && !message.content) || !ts) return null;
          return (
            <div
              className={`mt-1.5 text-[10px] tabular-nums ${
                isUser ? "text-primary-foreground/60 text-right" : "text-muted-foreground/70"
              }`}
            >
              {formatStamp(ts)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function AssistantBody({
  message,
  onOpenDocs,
}: {
  message: LocalMessage;
  onOpenDocs?: () => void;
}) {
  const result = useMemo(() => parseTslResult(message.content), [message.content]);
  const authScore = result.trace?.authority?.score;

  // status: done → short pointer; full script in the panel.
  if (
    result.status === "done" &&
    result.script &&
    !isNonScriptResponse(result.script)
  ) {
    const isRevision = result.revised === true;
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-foreground">
          {isRevision ? (
            <>
              Done — I edited the script in the side panel
              {result.revisionNote ? ` (${result.revisionNote})` : ""}. Only that
              change was applied; the rest of the script is untouched.
            </>
          ) : (
            <>
              Your TSL is ready. It's in the side panel, Meta-formatted and
              copy-ready.
              {typeof authScore === "number" && (
                <span
                  className={`ml-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold align-middle ${
                    authScore >= 90
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : authScore >= 80
                        ? "bg-primary text-primary-foreground"
                        : authScore >= 65
                          ? "bg-amber-500 text-white"
                          : "bg-muted text-muted-foreground"
                  }`}
                  title={
                    authScore >= 80
                      ? "Passed the authority gate (≥80)"
                      : "Best of up to 6 attempts — below the 80 bar"
                  }
                  data-testid="bubble-authority-score"
                >
                  Authority {authScore}/100
                </span>
              )}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onOpenDocs}
          className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background hover:bg-muted px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors"
          data-testid="button-open-docs-from-bubble"
        >
          <PanelRightOpen className="size-3.5" />
          <span>{isRevision ? "Open edited script" : "Open in side panel"}</span>
        </button>
      </div>
    );
  }

  // status: answer → plain assistant prose.
  const proseText =
    result.answer ||
    (result.status === "done" && result.script ? result.script : "");
  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{proseText}</ReactMarkdown>
      {message.streaming && message.content && (
        <span className="inline-block w-2 h-4 bg-current animate-pulse motion-reduce:animate-none ml-0.5 align-middle" />
      )}
    </div>
  );
}

// ── ThinkingState (staged working indicator) ──────────────────────────────────
function ThinkingState({ startedAt }: { startedAt?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const stage =
    elapsed < 4
      ? "Locking the story"
      : elapsed < 14
        ? "Building section-by-section"
        : elapsed < 35
          ? "Assembling + Meta-formatting"
          : elapsed < 70
            ? "Scoring on the authority rubric"
            : elapsed < 130
              ? "Refining the weakest section"
              : elapsed < 200
                ? "Re-drafting for a stronger score"
                : elapsed < 280
                  ? "Polishing the language"
                  : "Final scoring pass — almost there";

  return (
    <div className="space-y-2.5 py-1 min-w-[280px]" data-testid="thinking-state">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex gap-1">
          <span className="size-1.5 rounded-full bg-primary animate-bounce motion-reduce:animate-none [animation-delay:-0.32s]" />
          <span className="size-1.5 rounded-full bg-primary animate-bounce motion-reduce:animate-none [animation-delay:-0.16s]" />
          <span className="size-1.5 rounded-full bg-primary animate-bounce motion-reduce:animate-none" />
        </span>
        <span className="font-medium text-foreground/80">{stage}…</span>
        <span className="ml-auto tabular-nums text-muted-foreground/70 tracking-tight">
          {formatDuration(elapsed * 1000)}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-progress-sweep" />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground/70">
        Writing a winning TSL — it drafts, scores, and refines up to 6 times.
        This usually takes 2–5 minutes; the finished script lands in the side panel.
      </p>
      <div className="space-y-1.5 pt-0.5">
        <div className="h-2.5 w-11/12 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer" />
        <div className="h-2.5 w-full rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer [animation-delay:-0.5s]" />
        <div className="h-2.5 w-3/4 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer [animation-delay:-1s]" />
      </div>
    </div>
  );
}
