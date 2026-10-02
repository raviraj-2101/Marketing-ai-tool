import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useProducts } from "@/hooks/useProducts";
import { ChatSidebar, type Chat } from "@/components/ugc/ChatSidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUp, Square, Sparkles, ArrowDown, Copy, Check, PanelRightOpen, PanelRightClose, PanelLeft, FileText, RotateCcw, X, MessageSquare, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat } from "@/lib/streamChat";
import { DocsPanel, DocsPanelMobile } from "@/components/ugc/DocsPanel";
import { parseAdsResults, buildIteratePrompt, type AdsResult } from "@/lib/parseAds";
import { AdsPanel } from "@/components/ugc/AdsPanel";
import { parseScriptDoc, parseFormat2Script, detectFormat, stripMetaForClient, buildDocSummary, type ScriptSegment } from "@/lib/parseScripts";
import { isPixarStoryboard, parseFormat3Script } from "@/lib/parsePixar";
import { isAnimatedCharsStoryboard, parseAnimatedCharsScript } from "@/lib/parseAnimatedChars";
import { saveAnimatedBuild, ANIMATED_BUILD_FORMAT, ANIMATED_BUILD_LABEL } from "@/lib/animatedBuildSession";
import { downloadScriptsDocx, downloadPixarDocx, downloadAnimatedDocx } from "@/lib/scriptsToDocx";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import {
  type LocalMessage,
  getStream,
  setStream,
  updateMessages,
  rekey,
  clearStream,
  markUnread,
  markRead,
} from "@/lib/streamStore";
import { useChatStream } from "@/lib/useChatStream";
import { isAllBrandsAccessUser, userHasBrandAccess } from "@/lib/brandAccess";

const PENDING_KEY = "pending:new-chat";
const MAX_INPUT_CHARS = 8000;
const LAST_PRODUCT_KEY = "ugc.lastProduct";
// Formats that can take an optional spoken hook above the script: the
// talking-avatar script formats only. 06/07 are included here even though they
// are CTA-EXCLUDED backend-side (different set, do not merge the two), and
// 08-classic-ugc-4-to-18min is excluded because it already has a hook built into
// its structure.
const HOOK_ALLOWED_FORMATS = new Set([
  "00-classic-ugc-under-60s",
  "05-classic-ugc-1-to-4min",
  "06-no-product-with-cta",
  "07-no-product-pure-talk",
]);

export default function ScriptChat() {
  const { user } = useAuth();
  const userId = user?.id;
  const reactQueryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const selectedChatId = searchParams.get("chat");

  // Programmatic nav (used by onMeta for new chats, keyboard shortcuts)
  const setSelectedChatId = useCallback(
    (id: string | null) => {
      if (id) setSearchParams({ chat: id });
      else setSearchParams({});
    },
    [setSearchParams],
  );

  const [product, setProduct] = useState<string>(() => {
    try { return localStorage.getItem(LAST_PRODUCT_KEY) || ""; } catch { return ""; }
  });
  const [input, setInput] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [lengthScope, setLengthScope] = useState<"under60s" | "above60s">("under60s");
  const [format, setFormat] = useState<string>("00-classic-ugc-under-60s");
  // CTA type for the next message. Per-request (NOT locked per-chat like format)
  // so the user can change it on any turn — picking a new value and resending
  // acts as the "second-prompt override." "default" = send nothing → skill.md
  // decides the CTA exactly as it does today.
  const [ctaType, setCtaType] = useState<"default" | "quiz" | "money-back" | "offer">("default");
  // "With hook" for the next message. PER-MESSAGE exactly like ctaType (never
  // locked at chat creation) — off => nothing is sent and the request is
  // identical to today's. Only the talking-avatar script formats get the tick;
  // note 06/07 are hook-INCLUDED even though they are CTA-excluded, and 08
  // already has its own structural hook so it is deliberately absent.
  const [withHook, setWithHook] = useState(false);
  const hookAllowed = HOOK_ALLOWED_FORMATS.has(format);

  // Tracks the newly-assigned chat id between onMeta (rekey fires) and the URL
  // state update catching up. Without this, viewKey briefly becomes null and the
  // EmptyState flashes for one render cycle.
  const transitionChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedChatId && transitionChatIdRef.current === selectedChatId) {
      transitionChatIdRef.current = null;
    }
  }, [selectedChatId]);

  const pendingExists = !!getStream(PENDING_KEY);
  const viewKey: string | null =
    selectedChatId ?? (pendingExists ? PENDING_KEY : transitionChatIdRef.current);

  const streamState = useChatStream(viewKey);
  const messages = streamState?.messages ?? [];
  const streaming = !!streamState?.streaming;

  // Server-side chat + messages for existing chats
  const { data: chatData } = useQuery<{ chat: any; messages: any[] }>({
    queryKey: ["/api/ugc/chats", selectedChatId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ugc/chats/${selectedChatId}`);
      return res.json();
    },
    enabled: !!selectedChatId,
  });

  // Inline header title editing. Persists via PATCH /api/ugc/chats/:id, which
  // sets is_title_manually_edited=true on the server so AI auto-titling is
  // disabled for this chat from then on.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const renameTitleMut = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const r = await apiRequest("PATCH", `/api/ugc/chats/${id}`, { title });
      return r.json();
    },
    onSuccess: (_d, { id, title }) => {
      reactQueryClient.setQueryData<{ chat: any; messages: any[] }>(
        ["/api/ugc/chats", id],
        (prev) => (prev ? { ...prev, chat: { ...prev.chat, title } } : prev),
      );
      reactQueryClient.setQueryData<Chat[]>(["/api/ugc/chats", userId || ""], (prev) =>
        prev ? prev.map((c) => (c.id === id ? { ...c, title } : c)) : prev,
      );
      reactQueryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", userId || ""] });
      reactQueryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", id] });
      setEditingTitle(false);
    },
    onError: () => {
      // Keep the input open so the user can retry or press Escape.
      toast({ title: "Couldn't rename chat", description: "Please try again.", variant: "destructive" });
    },
  });

  const startTitleEdit = () => {
    if (!selectedChatId) return;
    setTitleDraft(chatData?.chat?.title || "");
    setEditingTitle(true);
  };
  const commitTitleEdit = () => {
    // Guard against the Enter -> onSuccess(unmount) -> onBlur double-fire: the
    // blur fires before the closure's chatData reflects the optimistic update,
    // so without this a second PATCH would slip past the equality check below.
    if (renameTitleMut.isPending) return;
    const next = titleDraft.trim();
    if (!selectedChatId || !next || next === (chatData?.chat?.title || "")) {
      setEditingTitle(false);
      return;
    }
    renameTitleMut.mutate({ id: selectedChatId, title: next });
  };

  // Product list
  const { data: productList } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/ugc/products"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ugc/products");
      const json = await res.json();
      return json.products ?? [];
    },
  });

  // Gate products by permission: a strategist only sees products of the brands
  // they're assigned to (Admin / Super Admin / Dev see all). DB products carry
  // brand_id; the UGC product list is config-driven, matched to them by name.
  const { products: dbProducts } = useProducts();
  // Super Admin/Admin/Dev and All-Brands sentinel users see every product.
  const isProductAdmin = isAllBrandsAccessUser(user);
  const allowedProductNames = useMemo(() => {
    if (isProductAdmin) return null; // null = no restriction
    return new Set(
      (dbProducts ?? [])
        .filter((p) => p.brand_id && userHasBrandAccess(user, p.brand_id))
        .map((p) => (p.name || "").toLowerCase()),
    );
  }, [isProductAdmin, dbProducts, user]);
  const visibleProducts = useMemo(() => {
    const list = productList ?? [];
    if (!allowedProductNames) return list;
    return list.filter((p) => allowedProductNames.has((p.name || "").toLowerCase()));
  }, [productList, allowedProductNames]);

  // Format list (Classic / Comparison TOF / Comparison BOF). Selected once at
  // chat creation, exactly like the length-scope template choice.
  const { data: formatList } = useQuery<{ id: string; label: string; default?: boolean }[]>({
    queryKey: ["/api/ugc/formats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ugc/formats");
      const json = await res.json();
      return json.formats ?? [];
    },
  });

  useEffect(() => {
    if (!product && visibleProducts && visibleProducts.length > 0) {
      let stored: string | null = null;
      try { stored = localStorage.getItem(LAST_PRODUCT_KEY); } catch {}
      const next = stored && visibleProducts.some((p) => p.id === stored)
        ? stored
        : visibleProducts[0].id;
      setProduct(next);
    }
  }, [visibleProducts, product]);

  // Guard: if a cached/selected product is one this restricted user may NOT
  // access, switch them to an allowed one so they can't generate for it.
  useEffect(() => {
    if (allowedProductNames && product && visibleProducts.length > 0 &&
        !visibleProducts.some((p) => p.id === product)) {
      setProduct(visibleProducts[0].id);
    }
  }, [allowedProductNames, product, visibleProducts]);

  useEffect(() => {
    if (!product) return;
    try { localStorage.setItem(LAST_PRODUCT_KEY, product); } catch {}
  }, [product]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    if (el.disabled) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;
    el.focus({ preventScroll: true });
  }, [viewKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        setSelectedChatId(null);
        setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 0);
      } else if (mod && e.key === "/") {
        e.preventDefault();
        composerRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedChatId]);

  // Sync server messages into store (only when not actively streaming)
  useEffect(() => {
    if (!chatData || !selectedChatId) return;
    const cur = getStream(selectedChatId);
    if (cur?.streaming) return;
    setStream(selectedChatId, {
      messages: chatData.messages.map((m: any) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      streaming: false,
      abort: null,
    });
    setProduct(chatData.chat.product);
    const scope: any = chatData.chat.length_scope;
    if (scope === "above60s" || scope === "under60s") setLengthScope(scope);
    const fmt: any = chatData.chat.format;
    if (typeof fmt === "string" && fmt) setFormat(fmt);
  }, [chatData, selectedChatId]);

  // ---- Scroll intent + auto-follow ----------------------------------------
  const [autoFollow, setAutoFollow] = useState(true);
  const [showJumpPill, setShowJumpPill] = useState(false);
  const autoFollowRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const userScrolledRef = useRef(false);
  const streamingRef = useRef(streaming);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const setScrollRef = useCallback((node: HTMLDivElement | null) => { setScrollEl(node); }, []);

  const [bottomSentinelEl, setBottomSentinelEl] = useState<HTMLDivElement | null>(null);
  const setBottomSentinelRef = useCallback((node: HTMLDivElement | null) => { setBottomSentinelEl(node); }, []);

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
        } else {
          if (streamingRef.current && userScrolledRef.current) setShowJumpPill(true);
        }
      },
      { root: scrollEl, threshold: 0, rootMargin: "0px 0px -1px 0px" },
    );
    obs.observe(bottomSentinelEl);
    return () => obs.disconnect();
  }, [scrollEl, bottomSentinelEl]);

  useEffect(() => {
    if (!autoFollowRef.current) return;
    if (userScrolledRef.current) return;
    const el = scrollEl;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom > 80 && messages.length > 1) {
      userScrolledRef.current = true;
      autoFollowRef.current = false;
      setAutoFollow(false);
      if (streamingRef.current) setShowJumpPill(true);
      return;
    }
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
  }, [messages, scrollEl]);

  const jumpToLatest = () => {
    const el = scrollEl;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    userScrolledRef.current = false;
    autoFollowRef.current = true;
    setAutoFollow(true);
    setShowJumpPill(false);
    setTimeout(() => { programmaticScrollRef.current = false; }, 400);
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    const currentChatStream = viewKey ? getStream(viewKey) : undefined;
    if (currentChatStream?.streaming) return;
    if (overrideText === undefined) {
      setInput("");
      if (composerRef.current) composerRef.current.value = "";
    }

    const userMsg: LocalMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantMsg: LocalMessage = {
      id: `local-asst-${Date.now()}`,
      role: "assistant",
      content: "",
      streaming: true,
      awaitingFirstByte: true,
      startedAt: Date.now(),
    };

    const startKey = selectedChatId ?? PENDING_KEY;
    const ctrl = new AbortController();
    setStream(startKey, (prev) => ({
      messages: [...(prev?.messages ?? []), userMsg, assistantMsg],
      streaming: true,
      abort: ctrl,
    }));

    userScrolledRef.current = false;
    autoFollowRef.current = true;
    setAutoFollow(true);
    setShowJumpPill(false);

    let activeChatId = selectedChatId;
    let liveKey = startKey;

    try {
      await streamChat(
        {
          chatId: selectedChatId || undefined,
          product,
          content: text,
          lengthScope,
          userId: userId || undefined,
          format: format || undefined,
          ctaType: ctaType === "default" ? undefined : ctaType,
          withHook: (hookAllowed && withHook) || undefined,
        },
        {
          onMeta: (meta) => {
            activeChatId = meta.chatId;
            setStream(liveKey, (prev) => ({
              messages: prev?.messages ?? [],
              streaming: true,
              abort: prev?.abort ?? ctrl,
              jobId: meta.jobId,
            }));
            if (liveKey !== meta.chatId) {
              // Set the ref BEFORE rekey so the intermediate render (triggered by
              // the rekey notification) can resolve viewKey to meta.chatId instead
              // of null, preventing the EmptyState flash.
              transitionChatIdRef.current = meta.chatId;
              rekey(liveKey, meta.chatId);
              liveKey = meta.chatId;
            }
            if (!selectedChatId) {
              setSelectedChatId(meta.chatId);
            }
            // Optimistic sidebar insert
            reactQueryClient.setQueryData<Chat[]>(["/api/ugc/chats", userId || ""], (prev) => {
              const list = prev ?? [];
              if (list.some((c) => c.id === meta.chatId)) return list;
              const optimistic: Chat = {
                id: meta.chatId,
                title: meta.title || "New chat",
                product,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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
                  content: last.content + delta,
                  awaitingFirstByte: false,
                };
              }
              return copy;
            });
          },
          onTitle: (title) => {
            if (title && activeChatId) {
              reactQueryClient.setQueryData<Chat[]>(
                ["/api/ugc/chats", userId || ""],
                (prev) => prev ? prev.map((c) => c.id === activeChatId ? { ...c, title } : c) : prev,
              );
            }
            reactQueryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", userId || ""] });
            if (activeChatId) {
              reactQueryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", activeChatId] });
            }
          },
          onDone: () => {
            updateMessages(liveKey, (prev) =>
              prev.map((m) =>
                m.streaming ? { ...m, streaming: false, finishedAt: Date.now() } : m,
              ),
            );
            setStream(liveKey, (prev) => ({
              messages: prev?.messages ?? [],
              streaming: false,
              abort: null,
              unreadAt: prev?.unreadAt ?? null,
            }));
            const currentChatInUrl = new URLSearchParams(window.location.search).get("chat");
            if (activeChatId && currentChatInUrl !== activeChatId) {
              markUnread(activeChatId);
            }
            reactQueryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", userId || ""] });
            if (activeChatId) {
              reactQueryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", activeChatId] });
            }
          },
          onError: (msg) => {
            updateMessages(liveKey, (prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: `⚠️ ${msg}`,
                  streaming: false,
                  awaitingFirstByte: false,
                  finishedAt: Date.now(),
                };
              }
              return copy;
            });
          },
          onCancelled: () => {
            updateMessages(liveKey, (prev) =>
              prev.map((m) =>
                m.streaming
                  ? { ...m, streaming: false, awaitingFirstByte: false, finishedAt: Date.now(), content: m.content || "_(stopped)_" }
                  : m,
              ),
            );
          },
        },
        ctrl.signal,
      );
    } catch (err: any) {
      updateMessages(liveKey, (prev) =>
        prev.map((m) =>
          m.streaming
            ? { ...m, content: m.content || `⚠️ ${err?.message || "error"}`, streaming: false, awaitingFirstByte: false, finishedAt: Date.now() }
            : m,
        ),
      );
    } finally {
      const final = getStream(liveKey);
      if (final?.streaming) {
        setStream(liveKey, { messages: final.messages, streaming: false, abort: null });
      }
      if (liveKey === PENDING_KEY) clearStream(PENDING_KEY);
    }
  };

  const stopGeneration = () => {
    if (!viewKey) return;
    const cur = getStream(viewKey);
    if (cur?.jobId) {
      const token = localStorage.getItem("auth_jwt_token") || null;
      fetch(`${API_BASE}/api/ugc/jobs/${cur.jobId}/cancel`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }).catch(() => {});
    }
    cur?.abort?.abort();
    updateMessages(viewKey, (prev) =>
      prev.map((m) =>
        m.streaming
          ? { ...m, streaming: false, awaitingFirstByte: false, finishedAt: Date.now(), content: m.content || "_(stopped)_" }
          : m,
      ),
    );
    setStream(viewKey, (prev) => ({
      messages: prev?.messages ?? [],
      streaming: false,
      abort: null,
      jobId: null,
    }));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ChatSidebar already handles URL nav — just do unread bookkeeping here
  const handleSelectChat = (id: string | null) => {
    if (id) markRead(id);
  };

  useEffect(() => {
    if (selectedChatId) markRead(selectedChatId);
  }, [selectedChatId]);

  // ---- Docs panel state ---------------------------------------------------
  const latestAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return undefined;
  }, [messages]);

  const allScriptedMessages = useMemo(() => {
    const out: typeof messages = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      const content = m.content || "";
      // Pixar storyboards (Format 03) have no classic scripts[] but still
      // render in the side panel as scene cards.
      const d = parseScriptDoc(content);
      if (d.scripts.length > 0) {
        out.push(m);
        continue;
      }
      // Format 02 (unique-intro) yields 0 scripts from parseScriptDoc (no
      // Concept/P1/image-card anchors). Recognize it via its own parser so
      // the side panel still surfaces + auto-opens for those messages.
      // (Format 01 already passes through the image-card fallback above.)
      if (detectFormat(content) === "02") {
        const p2 = parseFormat2Script(content);
        if (p2 && p2.sections.length >= 2) out.push(m);
      }
    }
    return out;
  }, [messages]);

  // Which scripted message the side panel shows. null = follow the latest
  // assistant message; set to a specific id when that message's "Open in side
  // panel" button is clicked, so each storyboard/script opens ITS OWN panel
  // rather than always the latest one.
  const [selectedDocsMsgId, setSelectedDocsMsgId] = useState<string | null>(null);
  const docsMessage = useMemo(() => {
    if (selectedDocsMsgId) {
      const found = messages.find(
        (m) => m.id === selectedDocsMsgId && m.role === "assistant",
      );
      if (found) return found;
    }
    return latestAssistantMessage;
  }, [selectedDocsMsgId, messages, latestAssistantMessage]);

  const hasScripts = useMemo(
    () => allScriptedMessages.length > 0,
    [allScriptedMessages.length],
  );

  const [docsOpen, setDocsOpen] = useState(false);
  const [adsPanel, setAdsPanel] = useState<AdsResult | null>(null);

  // ── Chat-list sidebar: inline on lg+, slide-over drawer on smaller ────────
  // The shell has two left rails; below lg there isn't room for both rails +
  // a usable chat, so the chat list collapses into a toggle-able drawer.
  const [chatListOpen, setChatListOpen] = useState(false);
  const [isLgUp, setIsLgUp] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgUp(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (isLgUp) setChatListOpen(false);
  }, [isLgUp]);

  // ── Resizable + responsive side panel ────────────────────────────────────
  // The Generate-Scripts shell already has two left rails (nav + chat list)
  // before the chat. When a side panel opens we keep BOTH the chat and the
  // panel readable: the divider is draggable, the chat keeps a hard minimum,
  // and when the window is too small to fit both side-by-side we fall back to a
  // full-screen overlay instead of crushing either one.
  const PANEL_MIN = 340; // narrowest the panel may get when docked
  const PANEL_MAX = 760; // widest, so it never dominates a large screen
  const CHAT_MIN = 380; // the chat never shrinks below this when docked
  const DEFAULT_DOCS_WIDTH = 480;
  const splitRef = useRef<HTMLDivElement>(null);
  const [splitWidth, setSplitWidth] = useState<number>(() =>
    typeof window !== "undefined" ? Math.max(0, window.innerWidth - 544) : 1200,
  );
  useEffect(() => {
    const el = splitRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSplitWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [docsWidth, setDocsWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem("scripts-docs-width"));
    return v >= PANEL_MIN && v <= PANEL_MAX ? v : DEFAULT_DOCS_WIDTH;
  });
  useEffect(() => {
    try {
      localStorage.setItem("scripts-docs-width", String(Math.round(docsWidth)));
    } catch {
      /* ignore */
    }
  }, [docsWidth]);
  // Enough room to show chat + panel side-by-side at their minimums?
  const canDock = splitWidth >= CHAT_MIN + PANEL_MIN;
  // Cap the panel so the chat always keeps CHAT_MIN of space.
  const maxDocs = Math.min(PANEL_MAX, Math.max(PANEL_MIN, splitWidth - CHAT_MIN));
  const effDocsWidth = Math.min(Math.max(docsWidth, PANEL_MIN), maxDocs);
  const startDocsResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = effDocsWidth;
    const onMove = (ev: MouseEvent) => {
      // the handle sits on the panel's LEFT edge: drag left → wider panel
      setDocsWidth(Math.min(Math.max(startW + (startX - ev.clientX), PANEL_MIN), maxDocs));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onBuildUgc = (picked: Array<{
    title: string; plain: string; concept: string;
    angle?: string; angleLabel?: string; angleCode?: string;
    description?: string;
    // Optional spoken hook (ClickUp 86caz3tkg). Carried through sessionStorage
    // so BatchCreator can prefill its Hook box; absent for hook-off scripts.
    hook?: string;
    p1?: string; p2?: string;
    // Format-05 (Classic UGC 1-4 min) middle beats. Carried through to
    // BatchCreator via sessionStorage so the chat-import parser can prefill
    // the M1 / M2 textareas directly without re-scanning the body text.
    m1?: string; m2?: string;
    // Format-08 (Classic UGC 4-18 min) ordered HOOK / MODULE n / REVEAL
    // segments — same carrier, prefills HOOK / per-module / REVEAL fields.
    segments?: ScriptSegment[];
    avatarTypes?: Array<"doctor" | "normal" | "natural_wellness" | "any">;
    suggestedPersona?: string; suggestedSubAngle?: string; inspiredByAdIds?: string[];
    // Format-02 ("Unique Intro" A1/A2) marker. Carried through so BatchCreator
    // can surface the 3 advanced-intro script fields only for these scripts.
    isUniqueIntro?: boolean;
    // The 3 spoken callout lines from the Advanced Intro section — prefill
    // BatchCreator's 3 advanced-intro script fields.
    advanceScripts?: string[];
  }>) => {
    if (!picked.length) return;
    // Human-readable label for the selected format ("Unique Intro · A1
    // Label/Cause", "Classic UGC 1-4 min", …) so BatchCreator's Mode badge can
    // mirror the exact script type without re-fetching the format list.
    const formatLabel = formatList?.find((f) => f.id === format)?.label ?? "";
    try {
      window.sessionStorage.setItem(
        "ugc.create.payload",
        JSON.stringify({ product, chatId: selectedChatId, format, formatLabel, scripts: picked }),
      );
    } catch { /* sessionStorage quota */ }
    const ref = selectedChatId ? `?from=chat-${encodeURIComponent(selectedChatId)}` : "";
    navigate(`/ugc-builder/batch-creator${ref}`);
  };

  // Format 04 (Animated Characters) "Build Video" handoff. Mirrors onBuildUgc
  // but carries the parsed per-character storyboard (`animated`) under the
  // 04 format slug instead of classic `scripts`, reusing the same
  // sessionStorage key so BatchCreator hydrates identically.
  const onBuildVideo = () => {
    const content = docsMessage?.content ?? "";
    if (!content) return;
    const animated = parseAnimatedCharsScript(content);
    if (!animated) return;
    saveAnimatedBuild({
      product,
      chatId: selectedChatId,
      format: ANIMATED_BUILD_FORMAT,
      formatLabel: ANIMATED_BUILD_LABEL,
      animated,
    });
    const ref = selectedChatId ? `?from=chat-${encodeURIComponent(selectedChatId)}` : "";
    navigate(`/ugc-builder/batch-creator${ref}`);
  };

  const autoOpenedForMsgId = useRef<string | null>(null);
  useEffect(() => {
    setDocsOpen(false);
    setSelectedDocsMsgId(null);
    autoOpenedForMsgId.current = null;
  }, [viewKey]);
  useEffect(() => {
    if (!latestAssistantMessage) return;
    if (!hasScripts) return;
    if (autoOpenedForMsgId.current === latestAssistantMessage.id) return;
    autoOpenedForMsgId.current = latestAssistantMessage.id;
    // A fresh generation became the latest — follow it (clear any pin).
    setSelectedDocsMsgId(null);
    setDocsOpen(true);
    setAdsPanel(null);
  }, [latestAssistantMessage?.id, hasScripts]);

  const productLabel = productList?.find((p) => p.id === product)?.name ?? product;
  // Format label for the selected format (e.g. "Pixar-Style Video Ads (under 60s)") —
  // threaded into the pixar build session so new-video can stamp it as video_format.
  const formatLabel = formatList?.find((f) => f.id === format)?.label ?? "";

  // ---- Regenerate-Intro (Format 02 only) ----------------------------------
  // Sends a follow-up that instructs the model to keep the No-Product Body +
  // Product Reveal verbatim and only rewrite the 3 Advanced Intro callouts.
  const handleRegenerateIntro = () => {
    const prompt = [
      "Regenerate just the Advanced Intro section of the previous script you generated.",
      "",
      "Copy the **No-Product Body** and **Product Reveal** sections from your last message VERBATIM — every line of spoken script, every `### Callout` sub-block where present, and every `Scenery / Scene / Continuity / Visual` field unchanged.",
      "",
      "Only rewrite the 3 `### Callout N` sub-blocks inside the **Advanced Intro** with a fresh attempt. The new intro must still connect to the unchanged body — same product framing, same root-cause label, same overall thesis.",
      "",
      "Output a complete 3-section script (Advanced Intro + No-Product Body + Product Reveal) with the new intro and the verbatim body + reveal.",  
    ].join("\n");
    sendMessage(prompt);
  };

  // Regenerate-Intro is wired ONLY when we're viewing the latest scripted
  // message in this chat, it's a Format 02 script, and no stream is in flight.
  const isViewingLatestScripted =
    !!docsMessage &&
    allScriptedMessages.length > 0 &&
    docsMessage.id === allScriptedMessages[allScriptedMessages.length - 1].id;
  const canRegenerateIntro =
    !streaming &&
    isViewingLatestScripted &&
    detectFormat(docsMessage?.content || "") === "02";
  const onRegenerateIntro = canRegenerateIntro ? handleRegenerateIntro : undefined;

  return (
    <DashboardLayout>
      <div className="flex h-full w-full overflow-hidden bg-background">
        {/* Chat list — inline column on lg+, slide-over drawer below lg. */}
        {isLgUp ? (
          <ChatSidebar
            selectedChatId={selectedChatId}
            onSelect={handleSelectChat}
            userId={userId}
          />
        ) : (
          <Sheet open={chatListOpen} onOpenChange={setChatListOpen}>
            <SheetContent side="left" className="w-72 max-w-[85vw] p-0 [&>button]:hidden">
              <ChatSidebar
                selectedChatId={selectedChatId}
                onSelect={(id) => { handleSelectChat(id); setChatListOpen(false); }}
                userId={userId}
              />
            </SheetContent>
          </Sheet>
        )}

        <div ref={splitRef} className="flex-1 min-w-0 flex h-full overflow-hidden">
        <main className="flex-1 min-w-0 flex flex-col h-full relative overflow-hidden">
          {streaming && (
            <div
              className="absolute top-0 left-0 right-0 h-0.5 z-20 overflow-hidden bg-primary/10 pointer-events-none"
              aria-hidden="true"
            >
              <div className="h-full w-1/3 bg-primary animate-progress-sweep" />
            </div>
          )}

          <header className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 border-b border-border/60 bg-card/40 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              {!isLgUp && (
                <button
                  type="button"
                  onClick={() => setChatListOpen(true)}
                  className="-ml-1 size-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
                  aria-label="Open chat list"
                  title="Chats"
                  data-testid="button-open-chats"
                >
                  <PanelLeft className="size-4" />
                </button>
              )}
              <MessageSquare className="size-4 text-muted-foreground/70 shrink-0" />
              {editingTitle && selectedChatId ? (
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  autoFocus
                  onBlur={commitTitleEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTitleEdit();
                    else if (e.key === "Escape") setEditingTitle(false);
                  }}
                  className="h-7 w-64 text-[13.5px] font-semibold"
                  data-testid="input-header-title"
                />
              ) : (
                <span
                  className={`text-[13.5px] font-semibold tracking-tight truncate inline-flex items-center gap-1.5 ${selectedChatId ? "cursor-text group/title" : ""}`}
                  data-testid="text-header-title"
                  onDoubleClick={startTitleEdit}
                  title={selectedChatId ? "Double-click to rename" : undefined}
                >
                  {chatData?.chat?.title || (selectedChatId ? "Chat" : "New chat")}
                  {selectedChatId && (
                    <button
                      type="button"
                      onClick={startTitleEdit}
                      className="opacity-0 group-hover/title:opacity-100 transition-opacity text-muted-foreground/70 hover:text-foreground"
                      aria-label="Rename chat"
                      data-testid="button-header-rename"
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Product</span>
              <Select
                value={product}
                onValueChange={(v) => setProduct(v)}
                disabled={!!selectedChatId}
              >
                <SelectTrigger className="w-[220px] h-9" data-testid="select-product">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibleProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedChatId ? (
                <Select value={format} onValueChange={(v) => setFormat(v)}>
                  <SelectTrigger className="w-[210px] h-9" data-testid="select-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(formatList ?? [
                      { id: "00-classic-ugc-under-60s", label: "Classic UGC (under 60s)", default: true },
                      { id: "04-animated-characters-ads", label: "Animated Characters - Ads" },
                      { id: "08-classic-ugc-4-to-18min", label: "Classic UGC 4-18 min" },
                      { id: "06-no-product-with-cta", label: "No-Product · With CTA" },
                      { id: "07-no-product-pure-talk", label: "No-Product · Pure Talk" },
                    ]).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                        {f.default && <span className="ml-1.5 text-[10px] text-muted-foreground">Default</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/30 h-9 px-2.5 text-[11.5px] font-medium text-muted-foreground"
                  title="Script format locked at chat creation"
                >
                  <span className="text-foreground">
                    {formatList?.find((f) => f.id === format)?.label
                      ?? (/04-animated/i.test(format)
                        ? "Animated Characters - Ads"
                        : /4-to-18/i.test(format)
                        ? "Classic UGC 4-18 min"
                        : /^06-/.test(format)
                        ? "No-Product · With CTA"
                        : /^07-/.test(format)
                        ? "No-Product · Pure Talk"
                        : "Classic UGC (under 60s)")}
                  </span>
                </span>
              )}
              {/* CTA type — per-request. Default = skill.md decides (no directive
                  injected). Picking Quiz / Money-back / Offer forces the closing
                  CTA to that one type only. Stays enabled even on existing chats
                  so a follow-up message can override the CTA. */}
              <Select value={ctaType} onValueChange={(v) => setCtaType(v as any)}>
                <SelectTrigger className="w-[160px] h-9" data-testid="select-cta-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    CTA: Default
                    <span className="ml-1.5 text-[10px] text-muted-foreground">skill decides</span>
                  </SelectItem>
                  <SelectItem value="quiz">CTA: Quiz</SelectItem>
                  <SelectItem value="money-back">CTA: Money-back</SelectItem>
                  <SelectItem value="offer">CTA: Offer</SelectItem>
                </SelectContent>
              </Select>
              {/* With hook — per-request, exactly like the CTA picker above
                  (stays enabled on existing chats, never locked at chat
                  creation). Only rendered for the talking-avatar formats. When
                  off, nothing is sent and the request is identical to today. */}
              {hookAllowed && (
                <label
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background h-9 px-2.5 text-[11.5px] font-medium cursor-pointer select-none"
                  title="Add a short spoken hook (1-2 sentences) above the script"
                >
                  <Checkbox
                    checked={withHook}
                    onCheckedChange={(v) => setWithHook(v === true)}
                    data-testid="toggle-with-hook"
                  />
                  <span>With hook</span>
                </label>
              )}
              {selectedChatId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setDocsOpen((v) => !v); setSelectedDocsMsgId(null); setAdsPanel(null); }}
                  className="h-9 gap-1.5"
                  data-testid="button-toggle-docs"
                  title={docsOpen ? "Close scripts + report panel" : "Open scripts + report panel"}
                >
                  {docsOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                  <span className="hidden sm:inline">{docsOpen ? "Close" : "Panel"}</span>
                </Button>
              )}
            </div>
          </header>

          <div ref={setScrollRef} tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
            {messages.length === 0 ? (
              <EmptyState
                productLabel={productLabel}
                productSlug={product}
                onPick={(s) => setInput(s)}
              />
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
                {messages.map((m, idx) => {
                  const isLastAssistant =
                    m.role === "assistant" && idx === messages.length - 1 && !m.streaming;
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      productLabel={productLabel}
                      onOpenDocs={() => { setSelectedDocsMsgId(m.id); setDocsOpen(true); setAdsPanel(null); }}
                      onOpenAds={(res) => { setAdsPanel(res); setDocsOpen(false); }}
                      isLastAssistant={isLastAssistant}
                      onRegenerate={() => sendMessage("redo")}
                    />
                  );
                })}
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

          <div className="border-t border-border bg-background">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
              <div
                className={`relative rounded-2xl border bg-card shadow-sm focus-within:shadow-md transition-all duration-150 ${
                  input.length > MAX_INPUT_CHARS
                    ? "border-destructive/60 focus-within:border-destructive"
                    : "border-input focus-within:border-primary/40"
                }`}
              >
                <AutoGrowTextarea
                  value={input}
                  onChange={(v) => setInput(v)}
                  onKeyDown={onKeyDown}
                  placeholder={
                    streaming
                      ? "Drafting your next message… (send unlocks once the reply finishes)"
                      : "Send a message…  (Enter to send, Shift + Enter for new line)"
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
                      className="size-9 rounded-xl shadow-sm hover:scale-[1.03] active:scale-95 transition-transform"
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
                      className="size-9 rounded-xl shadow-sm hover:scale-[1.03] active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
                      onClick={() => sendMessage()}
                      disabled={!input.trim() || input.length > MAX_INPUT_CHARS}
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
                  Internal Acentecom tool · Conversations saved per email
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

        {/* Docs panel — resizable, docked beside the chat when there's room. */}
        {docsOpen && canDock && (
          <div
            className="flex h-full shrink-0 animate-slide-in-right motion-reduce:animate-none"
            style={{ width: effDocsWidth }}
            data-testid="docs-dock"
          >
            <ResizeHandle onMouseDown={startDocsResize} onReset={() => setDocsWidth(DEFAULT_DOCS_WIDTH)} />
            <DocsPanel
              message={docsMessage}
              allScriptedMessages={allScriptedMessages}
              open={docsOpen}
              onClose={() => setDocsOpen(false)}
              productLabel={productLabel}
              productSlug={product}
              videoFormat={formatLabel}
              chatId={selectedChatId}
              onRegenerateIntro={onRegenerateIntro}
              onBuildUgc={onBuildUgc}
              onBuildVideo={onBuildVideo}
            />
          </div>
        )}

        {/* Ads panel — resizable, docked beside the chat when there's room. */}
        {adsPanel && canDock && (
          <div
            className="flex h-full shrink-0 animate-slide-in-right motion-reduce:animate-none"
            style={{ width: effDocsWidth }}
            data-testid="ads-dock"
          >
            <ResizeHandle onMouseDown={startDocsResize} onReset={() => setDocsWidth(DEFAULT_DOCS_WIDTH)} />
            <AdsPanel
              result={adsPanel}
              onClose={() => setAdsPanel(null)}
              onIterate={(ad) => { setInput(buildIteratePrompt(ad)); setAdsPanel(null); }}
            />
          </div>
        )}
        </div>

        {/* Window too narrow for a split → full-screen overlay (never crushes). */}
        {docsOpen && !canDock && (
          <DocsPanelMobile
            message={docsMessage}
            allScriptedMessages={allScriptedMessages}
            open={docsOpen}
            onClose={() => setDocsOpen(false)}
            productLabel={productLabel}
            productSlug={product}
            videoFormat={formatLabel}
            chatId={selectedChatId}
            onRegenerateIntro={onRegenerateIntro}
            onBuildUgc={onBuildUgc}
            onBuildVideo={onBuildVideo}
          />
        )}
        {adsPanel && !canDock && (
          <div className="fixed inset-0 z-40 bg-background flex flex-col" role="dialog" aria-modal="true">
            <AdsPanel
              result={adsPanel}
              onClose={() => setAdsPanel(null)}
              onIterate={(ad) => { setInput(buildIteratePrompt(ad)); setAdsPanel(null); }}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

/* --------------------------- Resize handle --------------------------- */

function ResizeHandle({
  onMouseDown,
  onReset,
}: {
  onMouseDown: (e: ReactMouseEvent) => void;
  onReset?: () => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onReset}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel — drag, or double-click to reset"
      title="Drag to resize · double-click to reset"
      data-testid="docs-resize-handle"
      className="group/resize relative h-full w-1.5 shrink-0 cursor-col-resize bg-border/50 hover:bg-primary/50 active:bg-primary transition-colors"
    >
      {/* widen the hit area without taking layout space */}
      <span className="pointer-events-auto absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}

/* ----------------------------- EmptyState -------------------------------- */

function EmptyState({
  productLabel,
  productSlug,
  onPick,
}: {
  productLabel: string;
  productSlug?: string;
  onPick: (s: string) => void;
}) {
  const suggestions =
    (productSlug && SUGGESTIONS_BY_PRODUCT[productSlug]) || DEFAULT_SUGGESTIONS;
  return (
    <div className="h-full flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 size-[28rem] rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />
      <div className="relative max-w-2xl text-center">
        <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary mx-auto flex items-center justify-center mb-5 shadow-lg shadow-primary/10">
          <Sparkles className="size-6" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm px-3 py-0.5 text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          {productLabel}
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2" data-testid="text-empty-title">
          Write a UGC script
        </h2>
        <p className="text-[13.5px] text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
          60-second talking-head ad scripts. Ask for a full script,
          brainstorm hooks, or score a draft.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="group rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm px-4 py-3 text-[13px] hover:bg-card hover:border-border transition-all text-left cursor-pointer relative overflow-hidden"
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

const SUGGESTIONS_BY_PRODUCT: Record<string, string[]> = {
  "cleantra-lymphatic": [
    "Write one 60s avatar script on the bloating angle, archetype A2",
    "Give me 5 hook variants for the weight-loss angle",
    "Show me the top 5 spending ads launched in the past 7 days",
    "Top Meta ads with ROAS above 1 — then iterate on the best angle",
  ],
  "cleantra-oregano": [
    "Write one 60s avatar script on the parasite-cleanse angle",
    "Give me 5 hook variants for the gut-health angle",
    "Show me the top 5 spending ads launched in the past 7 days",
    "Top Meta ads with ROAS above 1 — then iterate on the best angle",
  ],
  "ledisa-glp1-patches": [
    "Write one 60s avatar script on the weight-loss angle",
    "Give me 5 hook variants for the cravings angle",
    "Show me the top 5 spending ads launched in the past 7 days",
    "Top Meta ads with ROAS above 1 — then iterate on the best angle",
  ],
};
const DEFAULT_SUGGESTIONS = [
  "Write a 60-second script on the lead angle",
  "Give me 5 hook variants for this product",
  "Show me the top 5 spending ads launched in the past 7 days",
  "Top Meta ads with ROAS above 1 — then iterate on the best angle",
];

/* ----------------------------- MessageBubble ----------------------------- */

const VALIDATION_FAIL_MARKER = /^<!--VALIDATION_FAILED:[^>]*-->\s*\n?/;

function MessageBubble({
  message,
  productLabel,
  onOpenDocs,
  onOpenAds,
  onRegenerate,
  isLastAssistant,
}: {
  message: LocalMessage;
  productLabel?: string;
  onOpenDocs?: () => void;
  onOpenAds?: (res: AdsResult) => void;
  onRegenerate?: () => void;
  isLastAssistant?: boolean;
}) {
  const isUser = message.role === "user";
  const validationFailed = !isUser && VALIDATION_FAIL_MARKER.test(message.content);
  const showCopy = !isUser && !message.streaming && message.content.length > 20;

  return (
    <div
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} group`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div
        className={`relative max-w-[85%] min-w-0 rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : validationFailed
              ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/60"
              : "bg-card border border-card-border"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : message.streaming && !message.content ? (
          <ThinkingState startedAt={message.startedAt} />
        ) : (
          <AssistantMessageBody
            message={message}
            showCopy={showCopy}
            productLabel={productLabel}
            onOpenDocs={onOpenDocs}
            onOpenAds={onOpenAds}
            onRegenerate={validationFailed && isLastAssistant ? onRegenerate : undefined}
            validationFailed={validationFailed}
          />
        )}
        {showCopy && <CopyButton text={message.content} />}
      </div>
    </div>
  );
}

function AssistantMessageBody({
  message,
  showCopy,
  productLabel,
  onOpenDocs,
  onOpenAds,
  onRegenerate,
  validationFailed,
}: {
  message: LocalMessage;
  showCopy: boolean;
  productLabel?: string;
  onOpenDocs?: () => void;
  onOpenAds?: (res: AdsResult) => void;
  onRegenerate?: () => void;
  validationFailed?: boolean;
}) {
  const cleanContent = useMemo(
    () => stripMetaForClient(message.content).replace(VALIDATION_FAIL_MARKER, ""),
    [message.content],
  );
  const doc = useMemo(() => parseScriptDoc(cleanContent), [cleanContent]);
  // Parse the hidden <!--ADS_RESULTS:…--> marker from the RAW message content
  // (the marker is stripped from cleanContent by stripMetaForClient).
  const ads = useMemo(() => parseAdsResults(message.content), [message.content]);
  // Pixar storyboards (Format 03) render in the side panel as scene cards —
  // never dump the raw YAML in the chat bubble.
  const isPixar = useMemo(() => isPixarStoryboard(cleanContent), [cleanContent]);
  // Format 04 — Animated Characters storyboard. Like Pixar, render in the side
  // panel as cards; never dump the raw YAML in the chat bubble.
  const isAnimated = useMemo(() => isAnimatedCharsStoryboard(cleanContent), [cleanContent]);
  const hasScripts = doc.scripts.length > 0 && !validationFailed;
  // Format 02 (unique-intro) yields 0 scripts from parseScriptDoc, so detect
  // it separately and route its body to the side panel (instead of dumping
  // the whole script into the bubble). Skip on a failed draft so the raw text
  // + validator note stay visible in the bubble.
  const isStructured02 = useMemo(() => {
    if (validationFailed) return false;
    if (detectFormat(cleanContent) !== "02") return false;
    const p = parseFormat2Script(cleanContent);
    return !!(p && p.sections.length >= 2);
  }, [cleanContent, validationFailed]);
  // Pixar always routes to the side panel (valid OR validation-failed) so the
  // storyboard renders as cards rather than raw text.
  const sidePanelReady = (hasScripts || isPixar || isAnimated || isStructured02) && !message.streaming;
  // Preserve the validator note for a failed Pixar draft (appended after a
  // `---` rule) so the gate reason stays visible even though the YAML doesn't.
  const pixarNote = useMemo(() => {
    if ((!isPixar && !isAnimated) || !validationFailed) return "";
    const m = cleanContent.match(/\n-{3,}\s*\n([\s\S]*Validator note[\s\S]*)$/);
    return m ? m[1].trim() : "";
  }, [isPixar, isAnimated, validationFailed, cleanContent]);
  // const rawMarkdown = isPixar
  //   ? `Storyboard is ready in the side panel.${pixarNote ? `\n\n${pixarNote}` : ""}`
  //   : hasScripts
  //     ? "Scripts are ready in the side panel."
  //     : cleanContent;
  const rawMarkdown = (isPixar || isAnimated) ? `Storyboard is ready in the side panel.${pixarNote ? `\n\n${pixarNote}` : ""}` : (hasScripts || isStructured02)
    ? "Scripts are ready in the side panel."
    : cleanContent;
  // Strip HTML-style metadata comments (<!-- persona: ... --> etc.) from display,
  // plus any leftover image-card markers (no-scripts edge case) so the bubble
  // never shows literal `{{image-card: ...}}` / `{{image-card-end}}` text.
  const displayMarkdown = rawMarkdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{\s*image-card-end\s*\}\}/gi, "")
    .replace(/\{\{\s*image-card\s*:\s*[\w-]+\s*\}\}/gi, "");
  // Convert single newlines before bold/heading lines into paragraph breaks
  const bubbleMarkdown = displayMarkdown.replace(/\n(\*\*|#{1,6} )/g, '\n\n$1');

  return (
    <>
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_li+li]:mt-3 [&_p+ol]:mt-4 [&_p+ul]:mt-4 [&_ol]:mb-2 [&_ul]:mb-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-words [&_table]:block [&_table]:w-max [&_table]:max-w-full [&_table]:overflow-x-auto [&_p]:break-words">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{bubbleMarkdown}</ReactMarkdown>
        {message.streaming && message.content && (
          <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5 align-middle" />
        )}
      </div>
      {validationFailed && onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 text-[12px] font-medium transition-colors shadow-sm"
          data-testid="button-regenerate"
          title="Generate a fresh draft for the same prompt"
        >
          <RotateCcw className="size-3.5" />
          <span>Regenerate</span>
        </button>
      )}
      {sidePanelReady && (
        <button
          type="button"
          onClick={onOpenDocs}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background hover:bg-muted px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors"
          data-testid="button-open-docs-from-bubble"
        >
          <PanelRightOpen className="size-3.5" />
          <span>
            {(isPixar || isAnimated)
              ? "Open storyboard in side panel"
              : doc.scripts.length === 0
              ? "Open in side panel"
              : doc.scripts.length === 1
                  ? "Open script in side panel"
                  : `Open ${doc.scripts.length} scripts in side panel`}
          </span>
        </button>
      )}
      {ads && ads.count > 0 && (
        <button
          type="button"
          onClick={() => onOpenAds?.(ads)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-card-border px-2.5 py-1 text-[12px] font-medium hover:bg-muted"
        >
          <PanelRightOpen className="size-3.5" />
          <span>Open {ads.count} ad{ads.count === 1 ? "" : "s"}</span>
        </button>
      )}
      {/* Download .docx only renders for Format 00/01 (the P1/P2 + comparison
          shapes the scriptsToDocx builder understands). Format 02 yields 0
          parsed scripts, so gate on doc.scripts.length to avoid an empty
          .docx — Format 02 uses the side panel instead. */}
      {!message.streaming && doc.scripts.length > 0 && (
        <div className="mt-2">
          <DownloadDocxButton doc={doc} productLabel={productLabel} />
        </div>
      )}
      {!message.streaming && isPixar && (
        <div className="mt-2">
          <DownloadPixarDocxButton content={cleanContent} productLabel={productLabel} />
        </div>
      )}
      {!message.streaming && isAnimated && (
        <div className="mt-2">
          <DownloadAnimatedDocxButton content={cleanContent} productLabel={productLabel} />
        </div>
      )}
      {!message.streaming && message.startedAt && message.finishedAt && message.content.length > 200 && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          Generated in {formatDuration(message.finishedAt - message.startedAt)}
        </div>
      )}
    </>
  );
}

function DownloadDocxButton({
  doc,
  productLabel,
}: {
  doc: ReturnType<typeof parseScriptDoc>;
  productLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadScriptsDocx(doc, { productLabel });
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (err) {
      console.error("Failed to build .docx", err);
      toast({
        title: "Couldn't build the .docx",
        description: "Something went wrong building your Word document. Try again, or use the side-panel copy buttons instead.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background hover:bg-muted px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors disabled:opacity-50"
      data-testid="button-download-docx"
      title="Download all scripts as a .docx file"
    >
      {done ? <Check className="size-3.5 text-green-600" /> : <FileText className="size-3.5" />}
      <span>{busy ? "Building…" : done ? "Downloaded" : "Download .docx"}</span>
    </button>
  );
}

function DownloadAnimatedDocxButton({
  content,
  productLabel,
}: {
  content: string;
  productLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const parsed = parseAnimatedCharsScript(content);
      if (!parsed || parsed.characters.length === 0) {
        throw new Error("Could not parse the storyboard.");
      }
      await downloadAnimatedDocx(parsed, { productLabel });
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (err) {
      console.error("Failed to build Animated Characters .docx", err);
      toast({
        title: "Couldn't build the .docx",
        description: "Something went wrong building the storyboard document. Try again, or copy from the side panel instead.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background hover:bg-muted px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors disabled:opacity-50"
      data-testid="button-download-animated-docx"
      title="Download the storyboard as a .docx file"
    >
      {done ? <Check className="size-3.5 text-green-600" /> : <FileText className="size-3.5" />}
      <span>{busy ? "Building…" : done ? "Downloaded" : "Download .docx"}</span>
    </button>
  );
}

function DownloadPixarDocxButton({
  content,
  productLabel,
}: {
  content: string;
  productLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const parsed = parseFormat3Script(content);
      if (!parsed || parsed.scenes.length === 0) {
        throw new Error("Could not parse the storyboard.");
      }
      await downloadPixarDocx(parsed, { productLabel });
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (err) {
      console.error("Failed to build Pixar .docx", err);
      toast({
        title: "Couldn't build the .docx",
        description: "Something went wrong building the storyboard document. Try again, or copy from the side panel instead.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background hover:bg-muted px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors disabled:opacity-50"
      data-testid="button-download-pixar-docx"
      title="Download the storyboard as a .docx file"
    >
      {done ? <Check className="size-3.5 text-green-600" /> : <FileText className="size-3.5" />}
      <span>{busy ? "Building…" : done ? "Downloaded" : "Download .docx"}</span>
    </button>
  );
}

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
    elapsed < 4 ? "Thinking"
    : elapsed < 12 ? "Building the scene"
    : elapsed < 28 ? "Drafting the descent"
    : elapsed < 50 ? "Writing the body"
    : elapsed < 80 ? "Finishing the close"
    : "Almost there";

  return (
    <div className="space-y-3 py-1 min-w-[260px]" data-testid="thinking-state">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex gap-1">
          <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.32s]" />
          <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.16s]" />
          <span className="size-1.5 rounded-full bg-primary animate-bounce" />
        </span>
        <span className="font-medium">{stage}…</span>
        <span className="ml-auto tabular-nums text-muted-foreground/80">
          {formatDuration(elapsed * 1000)}
        </span>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-3/4 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer" />
        <div className="h-3 w-full rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer" />
        <div className="h-3 w-5/6 rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer" />
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const stripMarkdown = (s: string): string => {
    return s
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^---+$/gm, "")
      .replace(/`([^`]+)`/g, "$1");
  };

  const doCopy = async (mode: "markdown" | "plain") => {
    const out = mode === "plain" ? stripMarkdown(text) : text;
    try {
      await navigator.clipboard.writeText(out);
      setCopied(true);
      setShowMenu(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
      {showMenu ? (
        <div className="flex items-center gap-1 rounded-md border border-border bg-card shadow-md p-1">
          <button onClick={() => doCopy("plain")} className="text-xs px-2 py-1 rounded hover:bg-muted" data-testid="button-copy-plain">Plain</button>
          <button onClick={() => doCopy("markdown")} className="text-xs px-2 py-1 rounded hover:bg-muted" data-testid="button-copy-markdown">Markdown</button>
          <button onClick={() => setShowMenu(false)} className="size-6 rounded hover:bg-muted text-muted-foreground flex items-center justify-center" aria-label="Close copy menu" title="Close">
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowMenu(true)}
          className="flex items-center gap-1 rounded-md border border-border bg-card shadow-sm px-2 py-1 text-xs hover:bg-muted"
          data-testid="button-copy"
          aria-label="Copy message"
        >
          {copied ? (
            <><Check className="size-3 text-green-600" />Copied</>
          ) : (
            <><Copy className="size-3" />Copy</>
          )}
        </button>
      )}
    </div>
  );
}

const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}>(function AutoGrowTextarea(props, externalRef) {
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
      className={`w-full block ${props.className || ""}`}
      data-testid={props["data-testid"]}
      rows={1}
    />
  );
});
