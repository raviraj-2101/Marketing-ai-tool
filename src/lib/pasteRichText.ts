// Rebuilds blank lines between paragraphs when pasting rich text (e.g. from
// Google Docs) into a plain <textarea>.
//
// Why this exists: Google Docs shows visual spacing between paragraphs using CSS
// margins, NOT real empty lines. Its plain-text clipboard flavor therefore joins
// paragraphs with a single "\n" — so pasting into a plain textarea looks like the
// blank lines were deleted. The HTML flavor, however, keeps every paragraph as its
// own block element. We read that HTML and re-join the blocks with a blank line so
// the pasted text matches what the user saw in the doc.

const BLOCK_SELECTOR =
  "p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, tr";

function normalizeWhitespace(s: string): string {
  return s
    .replace(/\u00A0/g, " ") // non-breaking space -> normal space
    .replace(/[ \t\f\v]+/g, " ") // collapse runs of spaces/tabs
    .replace(/ *\n */g, "\n") // trim around soft line breaks
    .replace(/\n{2,}/g, "\n"); // keep internal soft breaks single
}

/**
 * Convert pasted HTML into plain text where each paragraph/block is separated by
 * a blank line. Returns "" when there is no usable HTML (caller should then fall
 * back to the browser's default plain-text paste).
 */
export function htmlToParagraphText(html: string): string {
  if (!html || typeof DOMParser === "undefined") return "";

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return "";

  body.querySelectorAll("style, script").forEach((n) => n.remove());
  // Turn soft line breaks (<br>) into real newlines before reading text.
  body.querySelectorAll("br").forEach((br) =>
    br.replaceWith(doc.createTextNode("\n")),
  );

  const blocks = Array.from(body.querySelectorAll(BLOCK_SELECTOR));

  let paragraphs: string[];
  if (blocks.length === 0) {
    paragraphs = [body.textContent ?? ""];
  } else {
    paragraphs = blocks
      // Only leaf blocks — skip wrappers that merely contain other blocks,
      // otherwise their text would be counted twice.
      .filter((el) => !el.querySelector(BLOCK_SELECTOR))
      .map((el) => normalizeWhitespace(el.textContent ?? ""));
  }

  return paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
}

export interface RichPasteResult {
  /** false -> caller should let the browser do its default plain-text paste. */
  handled: boolean;
  /** Full textarea value after inserting the rebuilt text at the selection. */
  nextValue: string;
  /** Where the caret should land after the inserted text. */
  caret: number;
}

/**
 * Decide how a paste should be applied to a plain textarea. When the clipboard
 * carries usable rich HTML, the paragraph spacing is rebuilt and inserted at the
 * current selection; otherwise `handled` is false and the caller does nothing.
 */
export function applyRichPaste(
  clipboardHtml: string,
  currentValue: string,
  selectionStart: number,
  selectionEnd: number,
): RichPasteResult {
  const rebuilt = htmlToParagraphText(clipboardHtml);
  if (!rebuilt) {
    return { handled: false, nextValue: currentValue, caret: selectionEnd };
  }
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const nextValue =
    currentValue.slice(0, start) + rebuilt + currentValue.slice(end);
  return { handled: true, nextValue, caret: start + rebuilt.length };
}
