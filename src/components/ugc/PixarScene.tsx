// PixarScene.tsx
//
// Renders one scene of a Format 03 (Pixar-style video ad) storyboard.
// Ported from the reference bench so the layout matches the client exactly:
//   - optional Bridge-from-prior banner (amber, dashed)
//   - header: scene number + duration/timecode
//   - top row: SPOKEN (left, multi-speaker aware) + VISUAL NOTES (right)
//   - bottom: AUDIO · EMOTIONAL BEAT (full width)

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseSpeakerTurns, type PixarSceneData } from "@/lib/parsePixar";

type PixarSceneProps = {
  scene: PixarSceneData;
};

export function PixarScene({ scene }: PixarSceneProps) {
  const visualRows: Array<{ label: string; value: string }> = [];
  if (scene.visual.charactersInScene)
    visualRows.push({ label: "Characters", value: scene.visual.charactersInScene });
  if (scene.visual.setting) visualRows.push({ label: "Setting", value: scene.visual.setting });
  if (scene.visual.characterExpression)
    visualRows.push({ label: "Expression", value: scene.visual.characterExpression });
  if (scene.visual.characterAction)
    visualRows.push({ label: "Action", value: scene.visual.characterAction });
  if (scene.visual.camera) visualRows.push({ label: "Camera", value: scene.visual.camera });
  // Always shown (Pixar law P19) so the per-scene product decision is visible.
  visualRows.push({ label: "Show product", value: scene.isProductToShow ? "Yes" : "No" });

  const showBridge =
    scene.bridgeBeat &&
    scene.bridgeBeat.trim() &&
    !/opening\s+scene|no\s+prior|n\/?a/i.test(scene.bridgeBeat);
  return (
    <article
      className="rounded-lg border border-border bg-background overflow-hidden"
      data-testid={`pixar-scene-${scene.sceneNumber}`}
    >
      {showBridge && (
        <div
          className="border-b border-dashed border-amber-500/40 bg-amber-500/[0.08] px-4 py-2"
          data-testid={`pixar-scene-${scene.sceneNumber}-bridge`}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[9.5px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400 shrink-0">
              Bridge from prior
            </span>
            <p className="text-[12px] leading-snug text-foreground/85 whitespace-pre-wrap">
              {scene.bridgeBeat}
            </p>
          </div>
        </div>
      )}
      <header className="border-b border-border/60 bg-muted/30 px-4 py-2.5 flex items-baseline gap-3">
        <span className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-[12px] font-bold tabular-nums px-2 py-0.5 leading-none">
          Scene&nbsp;{scene.sceneNumber}
        </span>
        {scene.isProductToShow && (
          <span
            className="inline-flex items-center justify-center rounded-md bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 leading-none ring-1 ring-emerald-600/30"
            data-testid={`pixar-scene-${scene.sceneNumber}-product`}
            title="The product is showcased in this scene"
          >
            Product
          </span>
        )}
        {scene.meta && (
          <span className="ml-auto text-[11px] text-muted-foreground/80 tabular-nums">
            {scene.meta}
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(180px,280px)] divide-y lg:divide-y-0 lg:divide-x divide-border/60">
        <div className="p-4" data-testid={`pixar-scene-${scene.sceneNumber}-spoken`}>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">
            Spoken
          </div>
          {(() => {
            const trimmed = scene.spokenLine.trim();
            const isPlaceholder =
              !trimmed ||
              trimmed.length < 3 ||
              /\b(?:visual[-\s]?only(?:\s+beat)?|no\s+dialogue|wordless|silent)\b/i.test(trimmed) ||
              /^\(\s*[—-]+\s*\)$|^\[?\s*no\s+dialogue\s*\]?$|^["']?\s*[—-]+\s*["']?$/i.test(trimmed);
            if (isPlaceholder) {
              return (
                <div
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2"
                  data-testid={`pixar-scene-${scene.sceneNumber}-spoken-missing`}
                  role="alert"
                >
                  <p className="text-[12.5px] font-semibold text-destructive leading-snug">
                    ⚠️ Spoken line missing — the LLM didn't supply a usable
                    <code className="mx-1 px-1 py-0.5 rounded bg-destructive/15 text-[11.5px]">spoken_line</code>
                    for this scene.
                  </p>
                  <p className="mt-1 text-[11.5px] text-destructive/90 leading-snug">
                    Pixar scenes must always carry VO (LAW P15). Regenerate this
                    script — a real dialogue or interior monologue line should
                    appear here.
                  </p>
                </div>
              );
            }
            const turns = parseSpeakerTurns(scene.spokenLine);
            const hasAnySpeaker = turns.some((t) => t.speaker);
            if (turns.length === 1 && !hasAnySpeaker) {
              return (
                <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:font-semibold">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{turns[0].text}</ReactMarkdown>
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {turns.map((turn, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border/50 bg-card/40 px-3 py-2"
                    data-testid={`pixar-scene-${scene.sceneNumber}-turn-${i}`}
                  >
                    {turn.speaker && (
                      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-primary/80 mb-1">
                        {turn.speaker}
                      </div>
                    )}
                    <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:font-semibold">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <aside
          className="p-4 bg-card/30"
          data-testid={`pixar-scene-${scene.sceneNumber}-visual`}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">
            Visual notes
          </div>
          {visualRows.length === 0 ? (
            <p className="text-[11.5px] italic text-muted-foreground/60">
              No visual notes supplied.
            </p>
          ) : (
            <dl className="space-y-2 text-[12px] leading-snug">
              {visualRows.map((r) => (
                <div key={r.label}>
                  <dt className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80">
                    {r.label}
                  </dt>
                  <dd className="text-foreground/90 mt-0.5 whitespace-pre-wrap">
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </aside>
      </div>

      {scene.audioBeat && scene.audioBeat.trim() && (
        <div
          className="border-t border-border/60 bg-amber-500/[0.06] px-4 py-2.5"
          data-testid={`pixar-scene-${scene.sceneNumber}-audio`}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 mb-1">
            Audio · emotional beat
          </div>
          <p className="text-[12.5px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {scene.audioBeat}
          </p>
        </div>
      )}
    </article>
  );
}
