// TslScriptBlock.tsx
//
// TSL script block: the final TSL in a plain, readable block that PRESERVES
// the double line breaks (empty line between every line) exactly as the server
// returned them, plus a Copy button that writes the EXACT returned text to
// the clipboard (blank lines intact).
//
// No P1/P2 / scene / character parsing — a TSL is one continuous body.

import { Fragment, useState } from "react";
import { Copy, Check } from "lucide-react";

// Render plain script text but turn any http(s) URL into a clickable link.
// Whitespace (the double line breaks) is preserved because the output still
// lives inside the <pre whitespace-pre-wrap>. The Copy button copies the raw
// `script` string, so clickable links never affect what gets pasted into Meta.
function renderWithLinks(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//i.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        data-testid="tsl-product-link"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// ---------------------------------------------------------------------------
// TslScriptBlock — the final script, double-line-breaks preserved + Copy
// ---------------------------------------------------------------------------

export function TslScriptBlock({
  script,
  label = "Final TSL",
}: {
  /** The exact, Meta-formatted TSL body the server returned. Rendered
   *  verbatim — every blank line preserved. */
  script: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      // CRITICAL: write the EXACT returned text — no markdown stripping, no
      // whitespace collapse — so the double line breaks (empty line between
      // every line) survive a paste into Meta / a plain textarea.
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older browsers / insecure context — fall back to a hidden textarea.
      try {
        const ta = document.createElement("textarea");
        ta.value = script;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        /* give up silently */
      }
    }
  };

  return (
    <section
      className="rounded-xl border border-card-border bg-card overflow-hidden"
      data-testid="tsl-script-block"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background hover:bg-muted px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors"
          data-testid="button-copy-tsl"
          title="Copy the exact Meta-formatted text — blank lines preserved"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-600" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </header>
      {/*
        The script is rendered into a <pre> with `whitespace-pre-wrap` so the
        empty lines between beats are preserved EXACTLY as returned (a real FB
        post's double-spacing). Readable sans body, generous line-height. NOT a
        markdown renderer — a TSL is plain organic prose, and markdown would
        eat the asterisks / collapse the blank lines.
      */}
      <pre
        className="whitespace-pre-wrap break-words font-sans text-[14.5px] leading-[1.85] text-foreground px-5 py-4 m-0"
        data-testid="tsl-script-body"
      >
        {renderWithLinks(script)}
      </pre>
    </section>
  );
}
