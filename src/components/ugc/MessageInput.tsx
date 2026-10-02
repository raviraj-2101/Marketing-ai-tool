import { useRef, KeyboardEvent } from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  generating: boolean;
  disabled?: boolean;
}

export function MessageInput({ value, onChange, onSend, onCancel, generating, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !generating && !disabled && value.trim()) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="border-t border-border p-3 flex gap-2 items-end bg-background">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write me a doctor testimonial script… (Enter to send, Shift+Enter for new line)"
        className="flex-1 min-h-[60px] max-h-[160px] resize-none text-sm"
        disabled={generating || disabled}
      />
      <div className="flex flex-col gap-1.5">
        {generating ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="h-8 w-8 p-0 text-destructive border-destructive/40 hover:bg-destructive/10"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="h-8 w-8 p-0"
            title="Send (Enter)"
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
