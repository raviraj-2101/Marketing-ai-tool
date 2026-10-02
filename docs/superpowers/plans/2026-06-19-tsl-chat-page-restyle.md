# TslChatPage Restyle (Match ScriptChat Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `src/pages/TslChatPage.tsx` so its layout, structure, and Tailwind classes match `ScriptChat.tsx` pixel-for-pixel while keeping all TSL data wiring intact, and add inline rename/delete to the new TSL chat sidebar.

**Architecture:** Replace the hand-rolled `<aside>` in `TslChatPage.tsx` with a self-contained `TslChatSidebar` component (modelled on `ChatSidebar.tsx`) that hits `/api/tsl/chats` and wires PATCH/DELETE. The page itself is rewritten in a single task: copy ScriptChat's exact JSX skeleton, swap every UGC-specific symbol for its TSL equivalent, and thread the TSL wiring through the same slots ScriptChat already has.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (`AlertDialog`, `Button`, `Input`, `Select`, `Tooltip`), `@tanstack/react-query` mutations, `react-router-dom` v6 (`useParams`, `useNavigate`), `lucide-react`.

## Global Constraints

- Base directory: `D:\projects\Acentecom\ai-static-generator` (referred to as `<root>`)
- **Never touch:** `ScriptChat.tsx`, `TslDevelopPage.tsx`, `TslMetadataPage.tsx`, `TslLogPage.tsx`, `TslSettingsPage.tsx`, or any pipeline/lib code
- **Keep `DashboardLayout`** — do NOT create a TslBuilderShell or slim-rail replacement
- **No git add / no commit** at any step
- `PIPELINE_API_BASE` + `pipelineApiRequest` from `@/lib/queryClient` for all TSL endpoints
- TSL chat route: `/tsl-builder/generate-scripts/:chatId?` (existing, router-param based, no search-params)
- Rename endpoint: `PATCH ${PIPELINE_API_BASE}/api/tsl/chats/:id` body `{ title }` — uses `pipelineApiRequest`
- Delete endpoint: `DELETE ${PIPELINE_API_BASE}/api/tsl/chats/:id` — uses `pipelineApiRequest`
- Invalidate `['/api/tsl/chats']` after rename or delete
- TSL imports already in `TslChatPage.tsx`: `startTslChat`, `cancelTslChat`, `tslStreamStore`, `useTslChatStream`, `parseTslResult`, `isFinishedTsl`, `isNonScriptResponse`, `resolveFormatMeta`, `TslDocsPanel`, `TslDocsPanelMobile`
- Report written to `<root>/.git/sdd/ui-match-ugc-report.md` (create `.git/sdd/` if absent)
- `npx tsc --noEmit` and `npm run build` must succeed with no new TSL-file errors

---

## File Map

| File | Action |
|------|--------|
| `src/components/tsl/TslChatSidebar.tsx` | **Create** — self-contained sidebar component (rename + delete wired) |
| `src/pages/TslChatPage.tsx` | **Rewrite** — match ScriptChat skeleton; reuse all TSL wiring |
| `.git/sdd/ui-match-ugc-report.md` | **Create** — final report |

---

### Task 1: Create `TslChatSidebar` component

**Files:**
- Create: `src/components/tsl/TslChatSidebar.tsx`

**Interfaces:**
- Consumes: `chatId: string | undefined` (selected), `onNewChat: () => void` (navigate to `/tsl-builder/generate-scripts`), `useAuth` from `@/hooks/useAuth`, `pipelineApiRequest`/`PIPELINE_API_BASE` from `@/lib/queryClient`
- Produces: `export function TslChatSidebar({ chatId, onNewChat }: { chatId?: string; onNewChat: () => void })` — renders the sidebar, handles navigation internally via `useNavigate`

**No tests needed (visual component) — verify via tsc.**

- [ ] **Step 1: Create the file** with this exact content:

```tsx
// src/components/tsl/TslChatSidebar.tsx
//
// Sidebar for the TSL chat page. Mirrors the UGC ChatSidebar (src/components/ugc/ChatSidebar.tsx)
// but hits /api/tsl/* endpoints via pipelineApiRequest.
//
// Rename: PATCH ${PIPELINE_API_BASE}/api/tsl/chats/:id  body { title }
// Delete: DELETE ${PIPELINE_API_BASE}/api/tsl/chats/:id
// Both invalidate ['/api/tsl/chats'].

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pipelineApiRequest, pipelineQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Pencil, Trash2, Check, X, LogOut } from "lucide-react";
import { useTslChatStream } from "@/lib/useTslChatStream";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TslChatListItem {
  id: string;
  title: string;
  product: string;
  updated_at: number;
}

interface Props {
  chatId?: string;
  onNewChat: () => void;
}

export function TslChatSidebar({ chatId, onNewChat }: Props) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: chats = [], isLoading } = useQuery<TslChatListItem[]>({
    queryKey: ["/api/tsl/chats"],
    queryFn: pipelineQueryFn,
    refetchInterval: 30_000,
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const renameMut = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const r = await pipelineApiRequest("PATCH", `/api/tsl/chats/${id}`, { title });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
      setRenamingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await pipelineApiRequest("DELETE", `/api/tsl/chats/${id}`);
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
      if (chatId === id) {
        navigate("/tsl-builder/generate-scripts", { replace: true });
      }
    },
  });

  const startRename = (chat: TslChatListItem) => {
    setRenamingId(chat.id);
    setDraftTitle(chat.title);
  };

  return (
    <aside className="flex flex-col h-full w-72 border-r border-border bg-background">
      <div className="p-3 border-b border-border">
        <button
          onClick={onNewChat}
          className="inline-flex items-center justify-start gap-2 w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 hover:opacity-90 active:opacity-80"
          data-testid="button-new-chat"
        >
          <Plus className="size-4" />
          New chat
        </button>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {isLoading && (
            <div className="text-sm text-muted-foreground px-2 py-2">Loading chats…</div>
          )}
          {!isLoading && chats.length === 0 && (
            <div className="text-sm text-muted-foreground px-2 py-4">
              No chats yet. Start a new one.
            </div>
          )}
          {chats.map((chat) => {
            const isSelected = chat.id === chatId;
            const isRenaming = renamingId === chat.id;
            return (
              <div
                key={chat.id}
                className={`group rounded-md px-2 py-1.5 cursor-pointer flex items-center gap-2 ${
                  isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                }`}
                onClick={() => {
                  if (!isRenaming) navigate(`/tsl-builder/generate-scripts/${chat.id}`);
                }}
                data-testid={`chat-item-${chat.id}`}
              >
                <MessageSquare className="size-4 text-muted-foreground shrink-0" />
                {isRenaming ? (
                  <div
                    className="flex-1 flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && draftTitle.trim()) {
                          renameMut.mutate({ id: chat.id, title: draftTitle.trim() });
                        } else if (e.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                      className="h-7 text-sm"
                      data-testid={`input-rename-${chat.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      onClick={() =>
                        draftTitle.trim() &&
                        renameMut.mutate({ id: chat.id, title: draftTitle.trim() })
                      }
                      data-testid={`button-confirm-rename-${chat.id}`}
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="flex-1 truncate text-sm"
                          data-testid={`text-chat-title-${chat.id}`}
                        >
                          {chat.title}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs break-words">
                        {chat.title}
                      </TooltipContent>
                    </Tooltip>
                    <TslChatStatusDot chatId={chat.id} isSelected={isSelected} />
                    <div
                      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        onClick={() => startRename(chat)}
                        data-testid={`button-rename-${chat.id}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 text-destructive"
                            data-testid={`button-delete-${chat.id}`}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{chat.title}" and all its messages will be permanently removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMut.mutate(chat.id)}
                              data-testid={`button-confirm-delete-${chat.id}`}
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
          })}
        </div>
      </TooltipProvider>

      <div className="p-3 border-t border-border flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="text-sm truncate" data-testid="text-user-email">
            {user?.email}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut()}
          title="Sign out"
          data-testid="button-logout"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </aside>
  );
}

function TslChatStatusDot({
  chatId,
  isSelected,
}: {
  chatId: string;
  isSelected: boolean;
}) {
  const state = useTslChatStream(chatId);
  const streaming = !!state?.streaming;
  const unread = !isSelected && !!state?.unreadAt;
  if (!streaming && !unread) return null;
  return (
    <span
      className="shrink-0 mr-1 group-hover:hidden"
      aria-hidden="true"
      data-testid={`chat-status-${streaming ? "streaming" : "unread"}-${chatId}`}
    >
      <span
        className={
          streaming
            ? "block size-2 rounded-full bg-primary animate-pulse"
            : "block size-2 rounded-full bg-primary"
        }
      />
    </span>
  );
}
```

- [ ] **Step 2: Verify TypeScript** — run `npx tsc --noEmit` from `<root>` and confirm no errors in `TslChatSidebar.tsx`. If `pipelineApiRequest` is not exported from `@/lib/queryClient`, check the export list and use `pipelineQueryFn` for the query + a manual `fetch` with auth headers for mutations (the pattern already used in the file). The `pipelineApiRequest` is exported at line 48 of `queryClient.ts` — it should resolve.

---

### Task 2: Rewrite `TslChatPage.tsx` to match ScriptChat layout

**Files:**
- Modify: `src/pages/TslChatPage.tsx` (full rewrite)

**Interfaces:**
- Consumes: `TslChatSidebar` from `./Task 1`; all existing TSL libs unchanged
- Produces: the page export `TslChatPage` with identical slot structure to `ScriptChat` but TSL data wiring

**Note on routing:** ScriptChat uses `useSearchParams` (`?chat=<id>`). TslChatPage uses `useParams` (`/:chatId`). Keep `useParams` — this is the established TSL routing; the new layout doesn't require changing it.

- [ ] **Step 1: Overwrite `src/pages/TslChatPage.tsx`** with the content below.

Key structural decisions vs ScriptChat:
1. `TslChatSidebar` replaces the hand-rolled `<aside>` and the old `chatsQ` fetch in the page.
2. `DashboardLayout` wrapper kept as-is.
3. Header: `MessageSquare` icon + inline title edit (double-click pencil) just like ScriptChat, plus Product selector + format selector/locked-badge + Panel button.
4. Empty state: `Sparkles` tile + product pill + "Write a winning TSL" heading + TSL description + 4 TSL example cards.
5. Composer: `AutoGrowTextarea` (copied verbatim from ScriptChat) with TSL placeholder; footer line "Internal Acentecom tool · Auto-pilot mode".
6. Message area, JumpPill, progress bar: identical to ScriptChat.
7. Right panels: `TslDocsPanel` + `TslDocsPanelMobile` (already present in old file, kept).
8. `useMutation` for inline header title edit hits `PATCH ${PIPELINE_API_BASE}/api/tsl/chats/:id` via `pipelineApiRequest`.

```tsx
// src/pages/TslChatPage.tsx
//
// TSL Chat — Generate Scripts page.
// Layout matches ScriptChat.tsx exactly. TSL data wiring is preserved from the
// previous version. Only the JSX skeleton changed.

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { TslChatSidebar } from "@/components/tsl/TslChatSidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  Square,
  Sparkles,
  ArrowDown,
  PanelRightOpen,
  PanelRightClose,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PIPELINE_API_BASE, pipelineQueryFn, pipelineApiRequest } from "@/lib/queryClient";
import { startTslChat, cancelTslChat } from "@/lib/tslStreamChat";
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
} from "@/lib/tslResult";
import { TslDocsPanel, TslDocsPanelMobile } from "@/components/tsl/TslDocsPanel";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProductSummary {
  id: string;
  name: string;
}

interface ChatPayload {
  chat: { id: string; title: string; product: string };
  messages: Array<{ id: string; role: "user" | "assistant"; content: string; created_at?: number }>;
}

type FormatsResponse = {
  formats: ReadonlyArray<{ id: string; name: string; description: string }>;
  default: string;
};

const PENDING_KEY = "pending:new-chat";
const MAX_INPUT_CHARS = 8000;

// ─────────────────────────────────────────────────────────────────────────────
export default function TslChatPage() {
  const { chatId } = useParams<{ chatId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Server-side data ────────────────────────────────────────────────────────
  const productsQ = useQuery<ProductSummary[]>({
    queryKey: ["/api/tsl/products"],
    queryFn: pipelineQueryFn,
  });

  const formatsQ = useQuery<FormatsResponse>({
    queryKey: ["/api/tsl/formats"],
    queryFn: pipelineQueryFn,
  });
  const formatObjs = formatsQ.data?.formats ?? [];
  const DEFAULT_FORMAT = formatsQ.data?.default ?? formatObjs[0]?.id ?? "";

  const chatQ = useQuery<ChatPayload>({
    queryKey: chatId ? [`/api/tsl/chats/${chatId}/messages`] : ["tsl-no-chat"],
    queryFn: pipelineQueryFn,
    enabled: !!chatId,
  });

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [product, setProduct] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [input, setInput] = useState("");
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Inline header title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const renameTitleMut = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const r = await pipelineApiRequest("PATCH", `/api/tsl/chats/${id}`, { title });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
      if (chatId) qc.invalidateQueries({ queryKey: [`/api/tsl/chats/${chatId}/messages`] });
      setEditingTitle(false);
    },
    onError: () => {
      toast({ title: "Couldn't rename chat", description: "Please try again.", variant: "destructive" });
    },
  });

  const startTitleEdit = () => {
    if (!chatId) return;
    setTitleDraft(chatQ.data?.chat?.title || "");
    setEditingTitle(true);
  };
  const commitTitleEdit = () => {
    if (renameTitleMut.isPending) return;
    const next = titleDraft.trim();
    if (!chatId || !next || next === (chatQ.data?.chat?.title || "")) {
      setEditingTitle(false);
      return;
    }
    renameTitleMut.mutate({ id: chatId, title: next });
  };

  // Default format once list loads
  useEffect(() => {
    if (!format && DEFAULT_FORMAT) setFormat(DEFAULT_FORMAT);
  }, [DEFAULT_FORMAT, format]);

  // Sync product from existing chat
  useEffect(() => {
    if (chatQ.data?.chat.product) setProduct(chatQ.data.chat.product);
  }, [chatQ.data?.chat.product]);

  // Focus composer on chat switch
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    if (el.disabled) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;
    el.focus({ preventScroll: true });
  }, [chatId]);

  // ── Stream store ────────────────────────────────────────────────────────────
  const pendingStream = useTslChatStream(PENDING_KEY);
  const transitionChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (chatId && transitionChatIdRef.current === chatId) {
      transitionChatIdRef.current = null;
    }
  }, [chatId]);

  const viewKey: string | null =
    chatId ?? (pendingStream ? PENDING_KEY : transitionChatIdRef.current);

  const streamState = useTslChatStream(viewKey);
  const liveMessages = streamState?.messages ?? [];
  const streaming = !!streamState?.streaming;

  // Sync server messages into store
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
    if (chatQ.data.chat.product) setProduct(chatQ.data.chat.product);
  }, [chatQ.data, chatId]);

  // ── Scroll intent + auto-follow (identical to ScriptChat) ──────────────────
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
    if (distFromBottom > 80 && liveMessages.length > 1) {
      userScrolledRef.current = true;
      autoFollowRef.current = false;
      setAutoFollow(false);
      if (streamingRef.current) setShowJumpPill(true);
      return;
    }
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
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
    setTimeout(() => { programmaticScrollRef.current = false; }, 400);
  };

  // ── Send message ────────────────────────────────────────────────────────────
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
              transitionChatIdRef.current = meta.chatId;
              rekey(liveKey, meta.chatId);
              liveKey = meta.chatId;
            }
            if (wasNewChat) {
              navigate(`/tsl-builder/generate-scripts/${meta.chatId}`, { replace: true });
            }
            qc.setQueryData<Array<{ id: string; title: string; product: string; updated_at: number }>>(
              ["/api/tsl/chats"],
              (prevList) => {
                const list = prevList ?? [];
                if (list.some((c) => c.id === meta.chatId)) return list;
                return [{ id: meta.chatId, title: meta.title || "New chat", product: slug, updated_at: Date.now() }, ...list];
              },
            );
          },
          onDelta: (delta) => {
            updateMessages(liveKey, (prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = { ...last, content: delta, awaitingFirstByte: false };
              }
              return copy;
            });
          },
          onTitle: () => {
            qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
          },
          onDone: (doneChatId) => {
            updateMessages(liveKey, (prev) =>
              prev.map((m) => m.streaming ? { ...m, streaming: false, finishedAt: Date.now() } : m),
            );
            setStream(liveKey, (prev) => ({
              messages: prev?.messages ?? [],
              streaming: false,
              abort: null,
              jobId: null,
            }));
            qc.invalidateQueries({ queryKey: ["/api/tsl/chats"] });
            const cid = doneChatId || activeChatId;
            if (cid) qc.invalidateQueries({ queryKey: [`/api/tsl/chats/${cid}/messages`] });
          },
          onError: (msg) => {
            updateMessages(liveKey, (prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: JSON.stringify({ status: "answer", answer: `⚠️ ${msg}` }),
                  streaming: false,
                  awaitingFirstByte: false,
                  finishedAt: Date.now(),
                };
              }
              return copy;
            });
            setStream(liveKey, (prev) => ({ messages: prev?.messages ?? [], streaming: false, abort: null, jobId: null }));
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
                      content: m.content || JSON.stringify({ status: "answer", answer: "_(stopped)_" }),
                    }
                  : m,
              ),
            );
            setStream(liveKey, (prev) => ({ messages: prev?.messages ?? [], streaming: false, abort: null, jobId: null }));
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
              content: m.content || JSON.stringify({ status: "answer", answer: "_(stopped)_" }),
            }
          : m,
      ),
    );
    setStream(viewKey, (prev) => ({ messages: prev?.messages ?? [], streaming: false, abort: null, jobId: null }));
    if (viewKey === PENDING_KEY) clearStream(PENDING_KEY);
  }, [viewKey]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // ── Docs panel state ────────────────────────────────────────────────────────
  const latestAssistantMessage = useMemo(() => {
    for (let i = liveMessages.length - 1; i >= 0; i--) {
      if (liveMessages[i].role === "assistant") return liveMessages[i];
    }
    return undefined;
  }, [liveMessages]);

  const finishedMessages = useMemo(
    () => liveMessages.filter((m) => m.role === "assistant" && isFinishedTsl(m.content)),
    [liveMessages],
  );

  const [selectedDocsMessageId, setSelectedDocsMessageId] = useState<string | null>(null);
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

  const hasFinishedScript = useMemo(() => isFinishedTsl(docsMessage?.content), [docsMessage?.content]);

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

  // ── Derived ─────────────────────────────────────────────────────────────────
  const products = productsQ.data ?? [];
  const productLabel = products.find((p) => p.id === product)?.name ?? product;

  return (
    <DashboardLayout>
      <div className="flex h-full w-full overflow-hidden bg-background">
        <TslChatSidebar
          chatId={chatId}
          onNewChat={() => navigate("/tsl-builder/generate-scripts")}
        />

        <main className="flex-1 flex flex-col h-full relative">
          {streaming && (
            <div
              className="absolute top-0 left-0 right-0 h-0.5 z-20 overflow-hidden bg-primary/10 pointer-events-none"
              aria-hidden="true"
            >
              <div className="h-full w-1/3 bg-primary animate-progress-sweep" />
            </div>
          )}

          <header className="flex items-center justify-between px-6 py-2.5 border-b border-border/60 bg-card/40 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="size-4 text-muted-foreground/70 shrink-0" />
              {editingTitle && chatId ? (
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
                  className={`text-[13.5px] font-semibold tracking-tight truncate inline-flex items-center gap-1.5 ${chatId ? "cursor-text group/title" : ""}`}
                  data-testid="text-header-title"
                  onDoubleClick={startTitleEdit}
                  title={chatId ? "Double-click to rename" : undefined}
                >
                  {chatQ.data?.chat?.title || (chatId ? "Chat" : "New chat")}
                  {chatId && (
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Product</span>
              <Select
                value={product}
                onValueChange={setProduct}
                disabled={!!chatId}
              >
                <SelectTrigger className="w-[220px] h-9" data-testid="select-product">
                  <SelectValue placeholder="Pick a product…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!chatId ? (
                <Select
                  value={format}
                  onValueChange={setFormat}
                  disabled={formatObjs.length === 0}
                >
                  <SelectTrigger className="w-[210px] h-9" data-testid="select-format">
                    <SelectValue placeholder="Format" />
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
                  className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/30 h-9 px-2.5 text-[11.5px] font-medium text-muted-foreground"
                  title="Format locked at chat creation"
                >
                  <span className="text-foreground">
                    {formatObjs.find((f) => f.id === (chatQ.data?.chat as any)?.format)?.name ?? "TSL format"}
                  </span>
                </span>
              )}
              {chatId && finishedMessages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDocsOpen((v) => !v)}
                  className="h-9 gap-1.5"
                  data-testid="button-toggle-docs"
                  title={docsOpen ? "Close TSL panel" : "Open TSL panel"}
                >
                  {docsOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                  <span className="hidden sm:inline">{docsOpen ? "Close" : "Panel"}</span>
                </Button>
              )}
            </div>
          </header>

          <div ref={setScrollRef} tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
            {liveMessages.length === 0 ? (
              <TslEmptyState
                productLabel={productLabel}
                onPick={(s) => setInput(s)}
              />
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
                {liveMessages.map((m) => (
                  <TslMessageBubble
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
                      ? "Generating… (send unlocks once the reply finishes)"
                      : "Describe the angle or story — or ask about the formats… (Enter to send)"
                  }
                  className="resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[52px] max-h-[40vh] pr-14 pl-4 py-3.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/70"
                  data-testid="input-composer"
                  ref={composerRef}
                  disabled={streaming}
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
                  >
                    {input.length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                    {input.length > MAX_INPUT_CHARS && " — too long"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>

        <TslDocsPanel
          message={docsMessage}
          finishedMessages={finishedMessages}
          selectedMessageId={selectedDocsMessageId}
          onSelectMessage={setSelectedDocsMessageId}
          open={docsOpen}
          onClose={() => setDocsOpen(false)}
          productLabel={productLabel}
        />
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

/* ─────────────────────────── EmptyState ─────────────────────────────────── */

const TSL_SUGGESTIONS = [
  "A woman starved herself to win back her husband's attention and nearly died.",
  "Give me 5 hooks for the same angle.",
  "What formats do we have?",
  "What makes a TSL convert?",
];

function TslEmptyState({
  productLabel,
  onPick,
}: {
  productLabel: string;
  onPick: (s: string) => void;
}) {
  return (
    <div className="h-full flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 size-[28rem] rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />
      <div className="relative max-w-2xl text-center">
        <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary mx-auto flex items-center justify-center mb-5 shadow-lg shadow-primary/10">
          <Sparkles className="size-6" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm px-3 py-0.5 text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          {productLabel || "Select a product"}
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2" data-testid="text-empty-title">
          Write a winning TSL
        </h2>
        <p className="text-[13.5px] text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
          The engine builds your script section-by-section against a proven format,
          scores it on the authority rubric, and hands back a Meta-ready winner.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
          {TSL_SUGGESTIONS.map((s) => (
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

/* ─────────────────────────── MessageBubble ──────────────────────────────── */

function TslMessageBubble({
  message,
  onOpenDocs,
}: {
  message: LocalMessage;
  onOpenDocs?: () => void;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} group`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div
        className={`relative max-w-[85%] min-w-0 rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-card-border"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : message.streaming && !message.content ? (
          <ThinkingState startedAt={message.startedAt} />
        ) : (
          <TslAssistantBody message={message} onOpenDocs={onOpenDocs} />
        )}
      </div>
    </div>
  );
}

function TslAssistantBody({
  message,
  onOpenDocs,
}: {
  message: LocalMessage;
  onOpenDocs?: () => void;
}) {
  const result = useMemo(() => parseTslResult(message.content), [message.content]);

  if (result.status === "done" && result.script && !isNonScriptResponse(result.script)) {
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
            <>Your TSL is ready. It's in the side panel, Meta-formatted and copy-ready.</>
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

  const proseText =
    result.answer ||
    (result.status === "done" && result.script ? result.script : "");
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{proseText}</ReactMarkdown>
      {message.streaming && message.content && (
        <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
}

/* ─────────────────────────── ThinkingState ──────────────────────────────── */

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
    elapsed < 4 ? "Writing draft"
    : elapsed < 18 ? "Checking structure & language"
    : elapsed < 40 ? "Scoring authority"
    : "Polishing the weakest section";

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

/* ─────────────────────────── AutoGrowTextarea ───────────────────────────── */

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

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 2: Run TypeScript check**

```
cd D:\projects\Acentecom\ai-static-generator
npx tsc --noEmit
```

Expected: zero errors in `TslChatPage.tsx` or `TslChatSidebar.tsx`. If you see a TS error about `result.revised` or `result.revisionNote` not existing on the `TslChatResult` type, open `src/lib/tslResult.ts`, check the return type of `parseTslResult`, and cast or guard as needed (e.g., `(result as any).revised`).

- [ ] **Step 3: Run build check**

```
cd D:\projects\Acentecom\ai-static-generator
npm run build
```

Expected: exits 0.

- [ ] **Step 4: Verify do-not-touch files are unchanged**

```
git diff --name-only src/pages/ScriptChat.tsx src/pages/TslDevelopPage.tsx src/pages/TslMetadataPage.tsx src/pages/TslLogPage.tsx src/pages/TslSettingsPage.tsx
```

Expected: empty output (no changes).

```
git status --short | grep -E "TslBuilderShell|slim-rail"
```

Expected: empty output (no such file was created).

---

### Task 3: Write the report

**Files:**
- Create: `.git/sdd/ui-match-ugc-report.md`

- [ ] **Step 1: Create the directory and write the report**

```
mkdir -p D:\projects\Acentecom\ai-static-generator\.git\sdd
```

Then write `.git/sdd/ui-match-ugc-report.md` with the following structure (fill in actual tsc/build results and git-diff output):

```markdown
# TslChatPage UI-Match-UGC Report

**Date:** 2026-06-19

## ScriptChat element mirror

| ScriptChat element | TslChatPage implementation |
|--------------------|---------------------------|
| `<DashboardLayout>` wrapper | Kept as-is |
| `ChatSidebar` (w72, "+ New chat" button, hover states, "Signed in as" footer, rename/delete) | `TslChatSidebar` in `src/components/tsl/TslChatSidebar.tsx` — mirrors ChatSidebar.tsx exactly |
| Top bar: `MessageSquare` + inline title edit (double-click / pencil) | Matched exactly — `editingTitle` state, `renameTitleMut` via PATCH `/api/tsl/chats/:id` |
| Top bar: Product selector (locked when chatId exists) | Matched — `<Select value={product} disabled={!!chatId}>` |
| Top bar: Format selector / locked badge | Matched — unlocked for new chat (with description), locked-badge when chatId exists |
| Top bar: Panel toggle button | Matched — `PanelRightOpen` / `PanelRightClose` |
| Progress bar (streaming) | Matched — `animate-progress-sweep` |
| Empty-state hero | `TslEmptyState`: sparkle tile, product pill, "Write a winning TSL", TSL description, 4 TSL suggestion cards in 2×2 grid |
| Message area (`max-w-4xl` centered, `space-y-6`) | Matched |
| Jump-to-latest pill | Matched |
| Composer (`rounded-2xl`, `AutoGrowTextarea`, ArrowUp/Square buttons) | Matched — TSL placeholder text |
| Footer line | "Internal Acentecom tool · Auto-pilot mode" |

## Rename / delete wiring

- **Rename:** `PATCH ${PIPELINE_API_BASE}/api/tsl/chats/:id` with body `{ title }` via `pipelineApiRequest`
  - Sidebar: inline pencil → input → Enter/check-button commits; Escape cancels
  - Header: double-click or pencil → `renameTitleMut`
  - Invalidates `['/api/tsl/chats']`
- **Delete:** `DELETE ${PIPELINE_API_BASE}/api/tsl/chats/:id` via `pipelineApiRequest`
  - shadcn `AlertDialog` confirmation
  - Navigates to `/tsl-builder/generate-scripts` if the deleted chat was selected
  - Invalidates `['/api/tsl/chats']`

## TSL content swaps

| UGC text | TSL replacement |
|----------|----------------|
| "Write a UGC script" | "Write a winning TSL" |
| "60-second talking-head ad scripts…" | "The engine builds your script section-by-section against a proven format, scores it on the authority rubric, and hands back a Meta-ready winner." |
| UGC example prompts | 4 TSL prompts (starvation hook, 5 hooks, formats, what makes TSL convert) |
| Footer "Conversations saved per email" | "Auto-pilot mode" |
| `/api/ugc/*` endpoints | `/api/tsl/*` via pipelineQueryFn / pipelineApiRequest |

## tsc + build result

- `npx tsc --noEmit`: <PASS / list any errors>
- `npm run build`: <PASS / list any errors>

## Do-not-touch confirmation

- `ScriptChat.tsx`: UNCHANGED
- `TslDevelopPage.tsx`: UNCHANGED
- `TslMetadataPage.tsx`: UNCHANGED
- `TslLogPage.tsx`: UNCHANGED
- `TslSettingsPage.tsx`: UNCHANGED
- No `TslBuilderShell` / slim-rail file created
- No `git add` performed

## Files changed

1. `src/components/tsl/TslChatSidebar.tsx` — CREATED
2. `src/pages/TslChatPage.tsx` — REWRITTEN
```

---

## Self-Review

**Spec coverage:**
- [x] `DashboardLayout` kept
- [x] Chat-list sidebar with "+ New chat", hover states, "Signed in as" footer — covered by `TslChatSidebar`
- [x] Top bar: title + product selector + format selector + panel toggle
- [x] Empty-state hero: sparkle tile, product pill, "Write a winning TSL", description, 4 TSL cards
- [x] Composer: `AutoGrowTextarea`, TSL placeholder, "Internal Acentecom tool · Auto-pilot mode" footer
- [x] Rename (pencil, hover-revealed) + delete (trash, AlertDialog) in sidebar rows
- [x] Inline header title rename (double-click / pencil) via `renameTitleMut` → PATCH `/api/tsl/chats/:id`
- [x] TSL data wiring unchanged (startTslChat, cancelTslChat, tslStreamStore, useTslChatStream, parseTslResult, isFinishedTsl, TslDocsPanel, TslDocsPanelMobile)
- [x] No git add / no commit
- [x] tsc + build verification steps included
- [x] Do-not-touch file check included
- [x] Report at `.git/sdd/ui-match-ugc-report.md`

**Placeholder scan:** No TBDs, no "implement later", no missing code blocks.

**Type consistency:**
- `LocalMessage` from `@/lib/tslStreamStore` — used consistently in `TslChatPage.tsx` and `TslChatSidebar.tsx` does not import it (not needed).
- `TslChatListItem` in `TslChatSidebar` matches the shape returned by `GET /api/tsl/chats` (`id`, `title`, `product`, `updated_at`).
- `pipelineApiRequest` is exported from `queryClient.ts` at line 48 — confirmed importable.
- `useTslChatStream` is already used in `TslChatPage.tsx` — safe to reuse in `TslChatSidebar`.
