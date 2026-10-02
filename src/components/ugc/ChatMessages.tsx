import { useEffect, useRef, useState, Fragment } from "react";
import { Loader2, Copy, Check, RefreshCw } from "lucide-react";

export interface Message {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface Props {
  messages: Message[];
  generating: boolean;
  generatingAttempt?: number;
  onRegenerate?: (messageId: string) => void;
}

const VALIDATION_FAILED_RE = /^<!--VALIDATION_FAILED:[^>]*-->/;

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, j) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={j}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={j}>{part.slice(1, -1)}</em>;
    return <Fragment key={j}>{part}</Fragment>;
  });
}

function renderContent(text: string) {
  const lines = text.split(/\r?\n/);
  return lines.map((line, i) => (
    <span key={i}>
      {renderInline(line)}
      {i < lines.length - 1 && <br />}
    </span>
  ));
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-border/40 text-muted-foreground hover:text-foreground shrink-0"
      title="Copy message"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function ChatMessages({ messages, generating, generatingAttempt, onRegenerate }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && !generating && (
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">Send a message to generate a UGC script.</p>
        </div>
      )}

      {messages.map((msg) => {
        const isValidationFailed = msg.role === "assistant" && VALIDATION_FAILED_RE.test(msg.content);
        const displayContent = isValidationFailed
          ? msg.content.replace(/^<!--VALIDATION_FAILED:[^>]*-->\s*\n?/, "")
          : msg.content;

        return (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} group`}
          >
            <div className={`flex items-start gap-1.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"} max-w-[85%]`}>
              <div
                className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : isValidationFailed
                      ? "bg-amber-500/10 border border-amber-500/30 text-foreground font-mono text-xs whitespace-pre-wrap"
                      : "bg-muted text-foreground font-mono text-xs whitespace-pre-wrap"
                }`}
              >
                {msg.role === "assistant" ? (
                  <>
                    {isValidationFailed && (
                      <div className="flex items-center gap-1.5 mb-2 text-[11px] text-amber-600 font-sans font-medium not-italic">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        Validation failed — script may be incomplete
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed m-0 p-0">
                      {displayContent}
                    </pre>
                    {isValidationFailed && onRegenerate && (
                      <button
                        onClick={() => onRegenerate(msg.id)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-500 font-sans"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerate
                      </button>
                    )}
                  </>
                ) : (
                  renderContent(msg.content)
                )}
              </div>
              {msg.role === "assistant" && <CopyButton text={displayContent} />}
            </div>
          </div>
        );
      })}

      {generating && (
        <div className="flex justify-start">
          <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              {generatingAttempt && generatingAttempt > 1
                ? `Generating script (attempt ${generatingAttempt}/3)…`
                : "Generating script…"}
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
