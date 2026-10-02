import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Pencil, Trash2, Check, X, LogOut } from "lucide-react";
import { useChatStream } from "@/lib/useChatStream";
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

export type Chat = {
  id: string;
  title: string;
  product: string;
  length_scope?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
};

type Props = {
  selectedChatId: string | null;
  onSelect: (chatId: string | null) => void;
  userId?: string;
};

export function ChatSidebar({ selectedChatId, onSelect, userId }: Props) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ["/api/ugc/chats", userId || ""],
    queryFn: async () => {
      if (!userId) return [];
      const res = await apiRequest("GET", `/api/ugc/chats?user_id=${encodeURIComponent(userId)}`);
      const json = await res.json();
      return json.chats ?? [];
    },
    enabled: !!userId,
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const renameMut = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const r = await apiRequest("PATCH", `/api/ugc/chats/${id}`, { title });
      return r.json();
    },
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", userId || ""] });
      queryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", id] });
      setRenamingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ugc/chats/${id}`);
    },
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ugc/chats", userId || ""] });
      if (selectedChatId === id) {
        setSearchParams({});
        onSelect(null);
      }
    },
  });

  const startRename = (chat: Chat) => {
    setRenamingId(chat.id);
    setDraftTitle(chat.title);
  };

  const handleSelectChat = (id: string | null) => {
    if (id) {
      setSearchParams({ chat: id });
    } else {
      setSearchParams({});
    }
    onSelect(id);
  };

  return (
    <aside className="flex flex-col h-full w-72 border-r border-border bg-background">
      <div className="p-3 border-b border-border">
        <button
          onClick={() => handleSelectChat(null)}
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
          const isSelected = chat.id === selectedChatId;
          const isRenaming = renamingId === chat.id;
          return (
            <div
              key={chat.id}
              className={`group rounded-md px-2 py-1.5 cursor-pointer flex items-center gap-2 ${
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/60"
              }`}
              onClick={() => {
                if (!isRenaming) handleSelectChat(chat.id);
              }}
              data-testid={`chat-item-${chat.id}`}
            >
              <MessageSquare className="size-4 text-muted-foreground shrink-0" />
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
                  <ChatRowStatusDot chatId={chat.id} isSelected={isSelected} />
                  <div
                    className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
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

function ChatRowStatusDot({
  chatId,
  isSelected,
}: {
  chatId: string;
  isSelected: boolean;
}) {
  const state = useChatStream(chatId);
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
