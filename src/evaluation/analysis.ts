/**
 * Transcript analysis. Everything here works on TEXT produced by speech recognition.
 * It cannot measure pronunciation, tone, confidence, or pauses, and speech recognisers often drop
 * hesitation sounds ("um", "uh"), so filler counts are a lower bound.
 */

export const STOPWORDS = new Set(
  (
    'a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those ' +
    'i you he she we they me my your our their them us his her do does did doing have has had having not no can could would should will ' +
    'shall may might must what which who whom when where why how there here than too very just also about into over under again more most ' +
    'some any each other such only own same both all few up down out off am let lets yeah okay ok'
  ).split(' '),
);

export function normaliseForMatching(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bbig o\b/g, 'o')
    .replace(/\b(o|log) of\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Builds a matcher for a keyword. Short keywords must match whole words (with optional plural). */
export function keywordRegex(keyword: string): RegExp {
  const norm = normaliseForMatching(keyword).trim();
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' ');
  const tail = norm.length >= 5 ? '[a-z0-9]*' : '(?:s|es)?';
  return new RegExp(`(?:^| )${escaped}${tail}(?= |$)`);
}

export function findKeyword(normalisedText: string, keywords: readonly string[]): string | null {
  for (const kw of keywords) {
    const m = keywordRegex(kw).exec(normalisedText);
    if (m) return m[0].trim();
  }
  return null;
}

/** Returns a short excerpt of the original transcript around the first occurrence of `term`. */
export function excerptAround(transcript: string, term: string, radius = 6): string {
  const tokens = transcript.split(/\s+/).filter(Boolean);
  const termWords = term.split(' ');
  const plain = tokens.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (let i = 0; i < plain.length; i++) {
    if (termWords.every((w, j) => (plain[i + j] ?? '').startsWith(w))) {
      const start = Math.max(0, i - radius);
      const end = Math.min(tokens.length, i + termWords.length + radius);
      return `${start > 0 ? '…' : ''}${tokens.slice(start, end).join(' ')}${end < tokens.length ? '…' : ''}`;
    }
  }
  return term;
}

const FILLER_TERMS = [
  'um',
  'uh',
  'erm',
  'er',
  'ah',
  'hmm',
  'you know',
  'i mean',
  'basically',
  'actually',
  'literally',
  'sort of',
  'kind of',
  'like i said',
  'so yeah',
  'and stuff',
] as const;

export function countFillers(text: string): Array<{ term: string; count: number }> {
  const norm = normaliseForMatching(text);
  const out: Array<{ term: string; count: number }> = [];
  for (const term of FILLER_TERMS) {
    const re = new RegExp(`(?<= )${term}(?= )`, 'g');
    const count = norm.match(re)?.length ?? 0;
    if (count > 0) out.push({ term, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Phrases of 2–4 words that repeat noticeably (ignoring phrases made only of stopwords). */
export function repeatedPhrases(text: string): Array<{ phrase: string; count: number }> {
  const tokens = words(text);
  const counts = new Map<string, number>();
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n);
      if (gram.every((w) => STOPWORDS.has(w))) continue;
      const key = gram.join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const minFor = (phrase: string) => (phrase.split(' ').length >= 3 ? 2 : 3);
  const candidates = [...counts.entries()]
    .filter(([p, c]) => c >= minFor(p))
    .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length);
  const chosen: Array<{ phrase: string; count: number }> = [];
  for (const [phrase, count] of candidates) {
    // Skip sub-phrases of something already reported with the same count.
    if (chosen.some((c) => c.phrase.includes(phrase) && c.count >= count)) continue;
    chosen.push({ phrase, count });
    if (chosen.length >= 5) break;
  }
  return chosen;
}

/** Sentence statistics, only when the recogniser produced punctuation; otherwise null. */
export function sentenceStats(text: string): { count: number; average: number } | null {
  const punctuated = /[.!?]/.test(text);
  if (!punctuated) return null;
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);
  if (sentences.length === 0) return null;
  const total = sentences.reduce((sum, s) => sum + words(s).length, 0);
  return { count: sentences.length, average: Math.round((total / sentences.length) * 10) / 10 };
}

/** Moving-average type-token ratio over content words; stable across lengths. Null if too short. */
export function lexicalVariety(text: string, window = 30): number | null {
  const content = words(text).filter((w) => !STOPWORDS.has(w));
  if (content.length < 15) return null;
  if (content.length <= window) return new Set(content).size / content.length;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + window <= content.length; i++) {
    sum += new Set(content.slice(i, i + window)).size / window;
    n++;
  }
  return Math.round((sum / n) * 100) / 100;
}

export const SIGNPOSTS: Record<'sequence' | 'cause' | 'contrast' | 'summary', readonly string[]> = {
  sequence: ['first', 'firstly', 'second', 'secondly', 'third', 'then', 'next', 'after that', 'finally', 'step one', 'to start'],
  cause: ['because', 'therefore', 'so that', 'which means', 'as a result', 'that is why', 'since', 'due to'],
  contrast: ['however', 'on the other hand', 'whereas', 'but', 'trade off', 'the downside', 'in contrast', 'although'],
  summary: ['in summary', 'to summarise', 'to summarize', 'overall', 'to conclude', 'in short', 'in conclusion'],
};

export function findSignposts(text: string): Record<keyof typeof SIGNPOSTS, string[]> {
  const norm = normaliseForMatching(text);
  const result = { sequence: [], cause: [], contrast: [], summary: [] } as Record<keyof typeof SIGNPOSTS, string[]>;
  for (const key of Object.keys(SIGNPOSTS) as Array<keyof typeof SIGNPOSTS>) {
    for (const s of SIGNPOSTS[key]) if (norm.includes(` ${s} `)) result[key].push(s);
  }
  return result;
}

const EXAMPLE_MARKERS = ['for example', 'for instance', 'such as', 'imagine', 'lets say', 'say we have', 'suppose', 'e g', 'like when', 'consider'];

export function findExampleMarkers(text: string): string[] {
  const norm = normaliseForMatching(text);
  return EXAMPLE_MARKERS.filter((m) => norm.includes(` ${m} `));
}

const WARM_UPS = ['so basically', 'okay so', 'ok so', 'thats a good question', 'good question', 'um so', 'so um', 'let me think', 'i think so', 'well so'];

/** Looks at the opening words. Returns the warm-up phrase found, if any. */
export function openingWarmUp(text: string): string | null {
  const opening = normaliseForMatching(words(text).slice(0, 10).join(' '));
  return WARM_UPS.find((w) => opening.includes(` ${w} `)) ?? null;
}

/** Content words of the prompt that also appear in the transcript, as a share of prompt content words. */
export function promptOverlap(prompt: string, transcript: string): { ratio: number; shared: string[] } {
  const generic = new Set(['explain', 'describe', 'compare', 'give', 'mention', 'example', 'least', 'one', 'two', 'three', 'would', 'your', 'choice', 'common', 'cover', 'concrete', 'including']);
  const promptWords = [...new Set(words(prompt).filter((w) => w.length > 3 && !STOPWORDS.has(w) && !generic.has(w)))];
  if (promptWords.length === 0) return { ratio: 0, shared: [] };
  const spoken = normaliseForMatching(transcript);
  const shared = promptWords.filter((w) => keywordRegex(w).test(spoken));
  return { ratio: shared.length / promptWords.length, shared };
}

export interface TranscriptQuality {
  ok: boolean;
  reason?: string;
}

export const MIN_WORDS = 20;

/** Decides whether there is enough reliable text to evaluate. Never fabricates feedback for bad input. */
export function assessTranscriptQuality(text: string, spokenMs: number): TranscriptQuality {
  const count = words(text).length;
  if (count === 0) {
    return { ok: false, reason: 'No speech was captured. Check that the right microphone is selected and try again.' };
  }
  if (count < MIN_WORDS) {
    return {
      ok: false,
      reason: `Only ${count} word${count === 1 ? ' was' : 's were'} captured — too little to give honest feedback. Try again and aim for at least ${MIN_WORDS} words.`,
    };
  }
  const minutes = spokenMs / 60000;
  if (spokenMs >= 45000 && count / minutes < 30) {
    return {
      ok: false,
      reason: 'Very little text was captured for the time you spoke, so the transcript is probably incomplete. Move closer to the microphone or check the input level, then try again.',
    };
  }
  return { ok: true };
}
