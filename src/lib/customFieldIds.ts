/**
 * Stable Supabase custom_fields row uuids for the three targeting fields used
 * across Ads DB and the UGC BatchCreator. These mirror the constant in
 * image-builder/src/services/ugcSystemPrompt.js — keep them in sync.
 */
export const CUSTOM_FIELD_IDS = {
  persona:   "3665d75f-646b-4455-b195-4b7997fa7e32",
  sub_angle: "517bddee-ec0a-4e9e-810a-9536ed649d2c",
  pains:     "c16033f6-6c4a-45a1-aec6-1ed7463f0cfb",
} as const;

export type TargetingFieldKey = keyof typeof CUSTOM_FIELD_IDS;
