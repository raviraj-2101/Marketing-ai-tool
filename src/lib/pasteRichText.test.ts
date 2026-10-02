import { describe, it, expect } from "vitest";
import { htmlToParagraphText, applyRichPaste } from "./pasteRichText";

describe("htmlToParagraphText", () => {
  it("restores blank lines between Google Docs paragraphs", () => {
    // This is the shape Google Docs puts on the clipboard: each paragraph is its
    // own <p>, the visual gap is margin (no empty lines in the markup).
    const googleDocsHtml = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-x">
      <p dir="ltr"><span>"I lift, I diet, I cut the beer."</span></p>
      <p dir="ltr"><span>For twenty-five years I stood over those men.</span></p>
      <p dir="ltr"><span>It has a NECK cause.</span></p>
    </b>`;

    expect(htmlToParagraphText(googleDocsHtml)).toBe(
      `"I lift, I diet, I cut the beer."\n\n` +
        `For twenty-five years I stood over those men.\n\n` +
        `It has a NECK cause.`,
    );
  });

  it("keeps soft line breaks (<br>) inside a paragraph as single newlines", () => {
    const html = `<p>Line one<br>Line two</p><p>Next paragraph</p>`;
    expect(htmlToParagraphText(html)).toBe("Line one\nLine two\n\nNext paragraph");
  });

  it("drops empty paragraphs and normalizes &nbsp;", () => {
    const html = `<p>First</p><p>&nbsp;</p><p></p><p>Second&nbsp;word</p>`;
    expect(htmlToParagraphText(html)).toBe("First\n\nSecond word");
  });

  it("does not double-count nested block wrappers", () => {
    const html = `<div><p>Alpha</p><p>Beta</p></div>`;
    expect(htmlToParagraphText(html)).toBe("Alpha\n\nBeta");
  });

  it("falls back to body text when there are no block elements", () => {
    const html = `<span>just inline text</span>`;
    expect(htmlToParagraphText(html)).toBe("just inline text");
  });

  it("returns empty string for empty/absent html so caller can use plain text", () => {
    expect(htmlToParagraphText("")).toBe("");
  });
});

describe("applyRichPaste", () => {
  const html = `<p>One</p><p>Two</p>`;

  it("inserts rebuilt text at the caret in an empty field", () => {
    const r = applyRichPaste(html, "", 0, 0);
    expect(r.handled).toBe(true);
    expect(r.nextValue).toBe("One\n\nTwo");
    expect(r.caret).toBe("One\n\nTwo".length);
  });

  it("inserts at the caret inside existing text", () => {
    const r = applyRichPaste(html, "ABEND", 2, 2); // caret between AB and END
    expect(r.nextValue).toBe("ABOne\n\nTwoEND");
    expect(r.caret).toBe(2 + "One\n\nTwo".length);
  });

  it("replaces the current selection", () => {
    const r = applyRichPaste(html, "ABXXEND", 2, 4); // select XX
    expect(r.nextValue).toBe("ABOne\n\nTwoEND");
  });

  it("does not handle a plain-text-only paste (no HTML flavor)", () => {
    const r = applyRichPaste("", "hello", 5, 5);
    expect(r.handled).toBe(false);
    expect(r.nextValue).toBe("hello");
  });
});
