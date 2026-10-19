import { z } from 'zod';
import { DifficultySchema, PracticeModeSchema } from '../domain/types';

/**
 * Non-sensitive preferences. The schema is `.strict()` and is the ONLY thing VerbalCode writes to
 * localStorage (plus the list of recently used question ids). Transcripts and audio have no place in it.
 */
export const LANGUAGES = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-IN', label: 'English (India)' },
] as const;

export const PreferencesSchema = z
  .object({
    speechSec: z.number().int().min(60).max(600),
    prepSec: z.number().int().min(0).max(3600),
    researchPrepSec: z.number().int().min(0).max(3600),
    mockLength: z.number().int().min(2).max(6),
    language: z.enum(['en-US', 'en-GB', 'en-IN']),
    /** Where speech is transcribed. Cloud requires explicit consent. */
    recognition: z.enum(['local', 'cloud']),
    cloudConsent: z.boolean(),
    /** AI evaluation is on only after the user accepted the disclosure. */
    aiEvaluation: z.boolean(),
    soundEffects: z.boolean(),
    showLiveTranscript: z.boolean(),
    filter: z.object({
      mode: PracticeModeSchema,
      categoryId: z.string().nullable(),
      subcategoryId: z.string().nullable(),
      difficulty: DifficultySchema.nullable(),
    }),
  })
  .strict();
export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  speechSec: 60,
  prepSec: 0,
  researchPrepSec: 300,
  mockLength: 3,
  language: 'en-US',
  recognition: 'local',
  cloudConsent: false,
  aiEvaluation: false,
  soundEffects: true,
  showLiveTranscript: true,
  filter: { mode: 'interview', categoryId: 'tech-ai', subcategoryId: null, difficulty: null },
};

const PREFS_KEY = 'verbalcode:prefs:v1';
const RECENT_KEY = 'verbalcode:recent:v1';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked storage (privacy mode)
  }
}

export function loadPreferences(): Preferences {
  try {
    const raw = storage()?.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const merged = { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as object) };
    const parsed = PreferencesSchema.safeParse(merged);
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Preferences): void {
  const parsed = PreferencesSchema.safeParse(prefs);
  if (!parsed.success) return; // never persist unexpected fields
  try {
    storage()?.setItem(PREFS_KEY, JSON.stringify(parsed.data));
  } catch {
    /* storage full or blocked — preferences simply won't persist */
  }
}

const RecentSchema = z.array(z.string().regex(/^[a-z0-9-]{2,80}$/)).max(50);

export function loadRecent(): string[] {
  try {
    const parsed = RecentSchema.safeParse(JSON.parse(storage()?.getItem(RECENT_KEY) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function saveRecent(ids: readonly string[]): void {
  const parsed = RecentSchema.safeParse(ids.slice(0, 50));
  if (!parsed.success) return;
  try {
    storage()?.setItem(RECENT_KEY, JSON.stringify(parsed.data));
  } catch {
    /* ignore */
  }
}

export function clearStoredData(): void {
  try {
    storage()?.removeItem(PREFS_KEY);
    storage()?.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
