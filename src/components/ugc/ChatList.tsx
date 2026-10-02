import { Plus, MessageSquare, Trash2 } from "lucide-react";

export interface Chat {
  id: string;
  title: string;
  product: string;
  length_scope: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onNewChat: () => void;
  onDelete: (chatId: string) => void;
}

export function ChatList({ chats, activeChatId, onSelect, onNewChat, onDelete }: Props) {
  return (
    <div className="flex flex-col h-full border-r border-border bg-background">
      {/* New chat button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New chat
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {chats.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">
            No chats yet.
          </p>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
              activeChatId === chat.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs truncate flex-1">{chat.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(chat.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all shrink-0"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
