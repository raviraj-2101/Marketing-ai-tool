// animatedCharsApi.ts
//
// FE client for the Format-04 ("Animated Characters") image workspace. Calls the
// synchronous JSON endpoints mounted at /api/animated-chars on the image-builder
// backend. Each call generates exactly ONE asset (a character image or a scene
// image); "regenerate" is simply re-invoking the same function.
//
// Fetch/header style mirrors BatchCreator.tsx generateScene (~1953): plain
// JSON POST to API_BASE with a Content-Type header and no auth header.

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

/**
 * Generate a single character image. For the brand (last) character, pass
 * `productImage` so the character is generated using the picked product image.
 */
export async function generateAnimatedCharacter(args: {
  characterConcept: string;
  role?: string;
  identifier?: string;
  productImage?: string;
  size?: string;
}): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/api/animated-chars/character`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      character_concept: args.characterConcept,
      role: args.role,
      identifier: args.identifier,
      product_image: args.productImage,
      size: args.size,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Character generation failed.");
  }
  return data.image as { url: string };
}

/**
 * Generate a single scene image for a character, using the just-generated
 * character image. For the brand (last) character, pass `productImage`.
 */
export async function generateAnimatedScene(args: {
  firstFramePrompt?: string;
  visual?: string;
  characterConcept?: string;
  characterImage: string;
  spokenLine?: string;
  productImage?: string;
  size?: string;
}): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/api/animated-chars/scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      first_frame_prompt: args.firstFramePrompt,
      visual: args.visual,
      character_concept: args.characterConcept,
      character_image: args.characterImage,
      spoken_line: args.spokenLine,
      product_image: args.productImage,
      size: args.size,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Scene generation failed.");
  }
  return data.image as { url: string };
}
