// adSetSplit.ts — splits N images into M balanced ad sets.

export interface AdSetPreview {
  adSetIndex: number;
  imageCount: number;
}

export interface SplitResult {
  adSetCount: number;
  perSet: AdSetPreview[];
  totalImages: number;
  adsPerAdSet: number;
}

export function planAdSetSplit(totalImages: number, adsPerAdSet: number): SplitResult {
  const N = Math.max(0, Math.floor(totalImages));
  const K = Math.max(1, Math.floor(adsPerAdSet));
  if (N === 0) return { adSetCount: 0, perSet: [], totalImages: 0, adsPerAdSet: K };
  const M = Math.ceil(N / K);
  const base = Math.floor(N / M);
  const remainder = N - base * M;
  const perSet: AdSetPreview[] = [];
  for (let i = 0; i < M; i++) {
    perSet.push({ adSetIndex: i + 1, imageCount: base + (i < remainder ? 1 : 0) });
  }
  return { adSetCount: M, perSet, totalImages: N, adsPerAdSet: K };
}

export function applyAdSetSplit<T>(items: T[], adsPerAdSet: number): T[][] {
  const plan = planAdSetSplit(items.length, adsPerAdSet);
  const slices: T[][] = [];
  let cursor = 0;
  for (const set of plan.perSet) {
    slices.push(items.slice(cursor, cursor + set.imageCount));
    cursor += set.imageCount;
  }
  return slices;
}
