import { describe, it, expect } from "vitest";
import { parseFormat3Script, isPixarStoryboard } from "./parsePixar";

const CANONICAL = `meta:
  main_character: "Bonnie, 62, retired teacher"
  main_pain:
    visible: "swollen ankles by evening"
    hidden: "feels her body is failing"
  chosen_template: "peer-aspiration-handoff"
  chosen_storyline_pattern: "peer-aspiration-handoff"
  scene_count: 2
storyboard:
  - scene_number: 1
    duration_s: 11
    visual:
      setting: "kitchen at dusk"
      camera: "wide shot"
      character_action: "peels compression sock"
    audio:
      spoken_line: "Six years of swelling. Still here."
      sound_design: "fridge hum"
      music: "none"
    character_expression: "tired, resigned"
    emotional_beat: "establish the symptom"
  - scene_number: 2
    duration_s: 12
    visual:
      setting: "bright cafe"
      camera: "two shot"
    audio:
      spoken_line: "Sharon: It is a clogged lymphatic system. These are BlueForce drops."
    character_expression: "hopeful"
    emotional_beat: "solution introduced"
    bridge_beat: "Sharon slides into the chair across from Bonnie"`;

// Hybrid shape some models emit: bare "Scene N" headings + indented scene_number
// WITHOUT the YAML list dash.
const HYBRID = `meta:
  main_character: "Bonnie, 62"
  main_pain: "swollen ankles"
  chosen_storyline_pattern: "peer-aspiration-handoff"
storyboard:

Scene 1
  scene_number: 1
  duration_s: 11
  visual:
    setting: "kitchen at dusk"
    camera: "wide shot"
    character_action: "peels sock"
  audio:
    spoken_line: "Six years of swelling."
    sound_design: "fridge hum"
  character_expression: "tired"
  emotional_beat: "establish symptom"

Scene 2
  scene_number: 2
  duration_s: 12
  visual:
    setting: "cafe"
  audio:
    spoken_line: "Sharon: It is a clogged lymphatic system. BlueForce drops."
  character_expression: "hopeful"
  emotional_beat: "solution"
  bridge_beat: "Sharon slides into the chair"`;

// Canonical YAML carrying the full character roster (Pixar law P17).
const WITH_ROSTER = `meta:
  main_character: "Kate, late-30s analyst, mother of one"
  characters:
    main_character: "Name: Kate. Late-30s white woman, wavy brown hair, the protagonist."
    character_1: "Name: Chris. Early-40s, grey henley, Kate's husband, dismissive then warm."
    character_2: "Name: The coach. Late-40s woman, delivers the reframe."
  main_pain:
    visible: "talked over at work"
    hidden: "believes her body failed her"
  chosen_storyline_pattern: "external-fix-failed-re-attribution"
storyboard:
  - scene_number: 1
    duration_s: 10
    visual:
      characters_in_scene: "Kate, Chris"
      setting: "kitchen at dusk"
    audio:
      spoken_line: "I do everything right."
    emotional_beat: "self-blame"
    is_product_to_show: false
  - scene_number: 2
    duration_s: 10
    visual:
      characters_in_scene: "Kate, The coach"
    audio:
      spoken_line: "These are BlueForce drops."
    emotional_beat: "product intro"
    is_product_to_show: true`;

describe("parsePixar", () => {
  it("parses the meta characters roster with labels + keeps top-level main_character", () => {
    const p = parseFormat3Script(WITH_ROSTER);
    expect(p).not.toBeNull();
    // The nested roster main_character must NOT clobber the persona paragraph.
    expect(p!.meta.mainCharacter).toBe("Kate, late-30s analyst, mother of one");
    const roster = p!.meta.characters!;
    expect(roster.length).toBe(3);
    expect(roster[0]).toEqual({
      label: "Main character",
      value: "Name: Kate. Late-30s white woman, wavy brown hair, the protagonist.",
    });
    expect(roster[1].label).toBe("Character 1");
    expect(roster[1].value).toContain("Chris");
    expect(roster[2].label).toBe("Character 2");
    // main_pain after the characters block still parses.
    expect(p!.meta.mainPain).toContain("talked over");
  });

  it("parses per-scene characters_in_scene (Pixar law P18)", () => {
    const p = parseFormat3Script(WITH_ROSTER);
    expect(p).not.toBeNull();
    expect(p!.scenes[0].visual.charactersInScene).toBe("Kate, Chris");
    expect(p!.scenes[0].visual.setting).toBe("kitchen at dusk");
    expect(p!.scenes[1].visual.charactersInScene).toBe("Kate, The coach");
  });

  it("parses per-scene is_product_to_show (Pixar law P19)", () => {
    const p = parseFormat3Script(WITH_ROSTER);
    expect(p).not.toBeNull();
    expect(p!.scenes[0].isProductToShow).toBe(false);
    expect(p!.scenes[1].isProductToShow).toBe(true);
    // CANONICAL has no flag → defaults to false.
    const c = parseFormat3Script(CANONICAL);
    expect(c!.scenes[0].isProductToShow).toBe(false);
  });

  it("leaves characters undefined when no roster is present", () => {
    const p = parseFormat3Script(CANONICAL);
    expect(p!.meta.characters).toBeUndefined();
  });


  it("detects + parses canonical YAML (- scene_number:)", () => {
    expect(isPixarStoryboard(CANONICAL)).toBe(true);
    const p = parseFormat3Script(CANONICAL);
    expect(p).not.toBeNull();
    expect(p!.scenes.length).toBe(2);
    expect(p!.meta.mainCharacter).toContain("Bonnie");
    expect(p!.scenes[0].spokenLine).toContain("Six years");
    expect(p!.scenes[0].visual.setting).toContain("kitchen");
    expect(p!.scenes[1].bridgeBeat).toContain("slides");
  });

  it("detects + parses the hybrid no-dash shape (Scene N + scene_number:)", () => {
    expect(isPixarStoryboard(HYBRID)).toBe(true);
    const p = parseFormat3Script(HYBRID);
    expect(p).not.toBeNull();
    expect(p!.scenes.length).toBe(2);
    expect(p!.scenes[0].spokenLine).toContain("Six years");
    expect(p!.scenes[1].visual.setting).toContain("cafe");
  });
});
