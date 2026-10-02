import { describe, it, expect } from "vitest";
import { parseScriptDoc, extractLeadingHook, extractHookModulesReveal } from "./parseScripts";

// Optional "With hook" (ClickUp 86caz3tkg). The load-bearing properties are:
//   1. the hook is lifted OUT of `body` (DocsPanel.scriptToPlain falls back to
//      `body` when there are no P1/P2 markers — the 06/07 case — so leaving it
//      in makes the avatar narrate the hook twice);
//   2. a hook-off script parses byte-for-byte as it does today;
//   3. a lone hook never fabricates format-08 `segments`.

const HOOKED_00 = `**Concept: Nurse explains the neck cause**

**HOOK**
Stop scrolling if your neck has been screaming at you since March.
**END HOOK**

**P1**
I used to think it was my pillow. It was not my pillow.

**P2**
This is the one I keep in the kitchen drawer now.
`;

const PLAIN_00 = `**Concept: Nurse explains the neck cause**

**P1**
I used to think it was my pillow. It was not my pillow.

**P2**
This is the one I keep in the kitchen drawer now.
`;

// 06/07 have no P1/P2 markers at all — the whole spoken take is the body.
const HOOKED_07 = `**Concept: Pure talk about sleep**

**HOOK**
Nobody warns you about the 3am wake-up.
**END HOOK**

I stopped fighting it and started counting the hours I actually slept.
`;

describe("extractLeadingHook", () => {
  it("splits the hook off and REMOVES it from the body", () => {
    const { hook, body } = extractLeadingHook(
      "**HOOK**\nStop scrolling.\n**END HOOK**\n\n**P1**\nThe rest.",
    );
    expect(hook).toBe("Stop scrolling.");
    expect(body).not.toContain("HOOK");
    expect(body.trim()).toBe("**P1**\nThe rest.");
  });

  it("returns the body UNCHANGED when there is no hook block", () => {
    const body = "**P1**\nThe rest.\n\n**P2**\nThe end.";
    expect(extractLeadingHook(body)).toEqual({ hook: "", body });
  });

  it("ignores a bare **HOOK** with no **END HOOK** terminator (format-08 shape)", () => {
    const body = "**HOOK**\nA structural 08 hook.\n\n**MODULE 1**\nBeat one.\n\n**REVEAL**\nThe reveal.";
    expect(extractLeadingHook(body)).toEqual({ hook: "", body });
  });
});

describe("parseScriptDoc — hook ON", () => {
  const doc = parseScriptDoc(HOOKED_00);

  it("exposes the hook as its own field", () => {
    expect(doc.scripts[0].hook).toBe(
      "Stop scrolling if your neck has been screaming at you since March.",
    );
  });

  it("keeps the hook OUT of body / p1 / p2", () => {
    const s = doc.scripts[0];
    expect(s.body).not.toMatch(/HOOK/);
    expect(s.body).not.toMatch(/Stop scrolling/);
    expect(s.p1).toBe("I used to think it was my pillow. It was not my pillow.");
    expect(s.p2).toBe("This is the one I keep in the kitchen drawer now.");
  });

  it("does not count hook words in wordCount", () => {
    expect(doc.scripts[0].wordCount).toBe(parseScriptDoc(PLAIN_00).scripts[0].wordCount);
  });

  it("never fabricates format-08 segments from a lone hook", () => {
    expect(doc.scripts[0].segments).toBeUndefined();
    expect(extractHookModulesReveal(doc.scripts[0].body)).toEqual([]);
  });

  it("strips the hook from a 06/07 body, where the body IS the spoken take", () => {
    const s = parseScriptDoc(HOOKED_07).scripts[0];
    expect(s.hook).toBe("Nobody warns you about the 3am wake-up.");
    expect(s.body).not.toMatch(/3am wake-up/);
    expect(s.body).toContain("I stopped fighting it");
  });
});

describe("parseScriptDoc — hook OFF is unchanged", () => {
  it("parses a hook-free script exactly as before, with an empty hook", () => {
    const s = parseScriptDoc(PLAIN_00).scripts[0];
    expect(s.hook).toBe("");
    expect(s.p1).toBe("I used to think it was my pillow. It was not my pillow.");
    expect(s.p2).toBe("This is the one I keep in the kitchen drawer now.");
    expect(s.body).toContain("**P1**");
  });

  it("leaves a real format-08 HOOK/MODULE/REVEAL script intact", () => {
    const doc = parseScriptDoc(
      "**Concept: Long one**\n\n**HOOK**\nThe 08 hook.\n\n**MODULE 1**\nBeat one.\n\n**REVEAL**\nThe reveal.\n",
    );
    const s = doc.scripts[0];
    expect(s.hook).toBe("");
    expect(s.segments?.map((x) => x.key)).toEqual(["hook", "module", "reveal"]);
  });
});
