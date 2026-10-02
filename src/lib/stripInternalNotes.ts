export function stripInternalNotes(raw: string | null | undefined): string {
  if (!raw) return raw ?? "";

  let out = raw;

  out = out.replace(/<scene_skeleton\b[^>]*>[\s\S]*?<\/scene_skeleton>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // If a **SCRIPT BODY** marker exists, take only what follows it — most reliable
  const scriptBodyMatch = out.match(/\*\*SCRIPT\s*BODY\*\*\s*\n+([\s\S]*)/i);
  if (scriptBodyMatch) {
    out = scriptBodyMatch[1];
  } else {
    // Fallback: strip the TSL CONFIG block via lookahead patterns
    out = out.replace(
      /\*\*TSL\s*CONFIG\*\*[\s\S]*?(?=\n\s*\n(?!\s*-\s*\*\*))/i,
      "",
    );
    out = out.replace(
      /\*\*TSL\s*CONFIG\*\*[\s\S]*?(?=\n\*\*[A-Z][^*]+\*\*\s*\n)/i,
      "",
    );
    // Strip leading key: value metadata block
    out = out.replace(
      /^\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*:\s*[^\n]+\n)+\s*\n/,
      "",
    );
  }

  // Strip **BODY:** header regardless of where it lands after extraction above
  out = out.replace(/^\s*\*\*BODY:\*\*\s*\n+/im, "");

  // Always strip QA checklist and everything after it
  out = out.replace(/\*\*[^*]*QA\s*CHECKLIST[^*]*\*\*[\s\S]*$/i, "");
  out = out.replace(/^[\t ]*#{0,6}[\t ]*\**\s*QA\s*CHECKLIST.*$[\s\S]*/im, "");

  // Clean up horizontal rules and excess blank lines
  out = out.replace(/^[\t ]*(?:-{3,}|\*{3,}|_{3,})[\t ]*$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}
