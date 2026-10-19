/**
 * Evidence extraction for the local evaluator. Everything here works on transcript text and returns
 * excerpts copied from the transcript, so feedback can always point at what was actually said.
 */
import type { ExpectedConcept, Question } from '../domain/types';
import { findKeyword, normaliseForMatching } from './analysis';
import type { Misconception, TopicProfile } from './topics';

// ---------------------------------------------------------------------------------------------
// Alignment: normalised words that remember which original token they came from.
// ---------------------------------------------------------------------------------------------

export interface AlignedTranscript {
  /** Original whitespace-separated tokens, unchanged. */
  tokens: string[];
  /** Normalised words: lowercase, apostrophes dropped, other punctuation split ("O(log" → "o", "log"). */
  words: string[];
  /** For each normalised word, the index of the original token it came from. */
  tokenOf: number[];
  /** `words` joined by single spaces. */
  text: string;
}

export function alignTranscript(transcript: string): AlignedTranscript {
  const tokens = transcript.split(/\s+/).filter(Boolean);
  const out: AlignedTranscript = { tokens, words: [], tokenOf: [], text: '' };
  tokens.forEach((token, i) => {
    for (const w of token.toLowerCase().replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean)) {
      out.words.push(w);
      out.tokenOf.push(i);
    }
  });
  out.text = out.words.join(' ');
  return out;
}

/** Original transcript text for normalised words [from, to], padded with `pad` tokens on each side. */
export function excerptForWords(a: AlignedTranscript, from: number, to: number, pad = 0): string {
  const first = Math.max(0, (a.tokenOf[from] ?? 0) - pad);
  const last = Math.min(a.tokens.length - 1, (a.tokenOf[to] ?? a.tokens.length - 1) + pad);
  return a.tokens.slice(first, last + 1).join(' ');
}

/** Index of the normalised word where a character offset in `a.text` falls. */
function wordAtChar(a: AlignedTranscript, offset: number): number {
  return a.text.slice(0, offset).split(' ').length - 1;
}

/** Finds a phrase (space-separated normalised words) in the aligned words. Returns the first word index. */
function findPhrase(a: AlignedTranscript, phrase: string): number {
  const target = phrase.split(' ').filter(Boolean);
  if (target.length === 0) return -1;
  const short = phrase.length < 5; // mirrors keywordRegex: short keywords match whole words only
  for (let i = 0; i + target.length <= a.words.length; i++) {
    const ok = target.every((t, j) => {
      const w = a.words[i + j]!;
      const last = j === target.length - 1;
      return last ? (short ? w === t || w === `${t}s` || w === `${t}es` : w.startsWith(t)) : w === t;
    });
    if (ok) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// Speech recognition: technical terms recognisers commonly mishear.
// ---------------------------------------------------------------------------------------------

export interface RecognitionAlias {
  heard: string;
  meant: string;
  /** A normal pronunciation (e.g. "sequel" for SQL), not an error: match it, but do not report it. */
  silent?: boolean;
}

/** Applied only to technical questions. Phrases are in normaliseForMatching form. */
export const RECOGNITION_ALIASES: readonly RecognitionAlias[] = [
  { heard: 'cash', meant: 'cache' },
  { heard: 'cashes', meant: 'caches' },
  { heard: 'cashing', meant: 'caching' },
  { heard: 'cashed', meant: 'cached' },
  { heard: 'go routine', meant: 'goroutine' },
  { heard: 'go routines', meant: 'goroutines' },
  { heard: 'mute x', meant: 'mutex' },
  { heard: 'a sink', meant: 'async' },
  { heard: 'jason', meant: 'json' },
  { heard: 'cue', meant: 'queue' },
  { heard: 'cues', meant: 'queues' },
  { heard: 'r a i i', meant: 'raii' },
  { heard: 'n log in', meant: 'n log n' },
  { heard: 'o log in', meant: 'o log n' },
  { heard: 'o and', meant: 'o n' },
  { heard: 'no sequel', meant: 'nosql', silent: true },
  { heard: 'sequel', meant: 'sql', silent: true },
];

export function applyAliases(normalised: string): { text: string; applied: RecognitionAlias[] } {
  let text = normalised;
  const applied: RecognitionAlias[] = [];
  for (const alias of RECOGNITION_ALIASES) {
    const re = new RegExp(`(?<= )${alias.heard}(?= )`, 'g');
    if (re.test(text)) {
      text = text.replace(re, alias.meant);
      applied.push(alias);
    }
  }
  return { text, applied };
}

// ---------------------------------------------------------------------------------------------
// Concept evidence: was a reference point mentioned, and was it explained or only named?
// ---------------------------------------------------------------------------------------------

/** Words that show an explanation (cause, condition, mechanism) rather than a bare list of terms. */
const EXPLANATION_MARKERS = new Set([
  'because', 'since', 'so', 'which', 'means', 'meaning', 'therefore', 'thus', 'hence', 'when', 'whenever', 'if',
  'by', 'instead', 'otherwise', 'while', 'whereas', 'unless', 'until', 'then', 'causes', 'prevents', 'allows',
  'lets', 'avoids', 'ensures', 'guarantees', 'needs', 'requires', 'without',
]);
const DEPTH_WINDOW = 8;

export type ConceptDepth = 'explained' | 'named';

export interface ConceptEvidence {
  concept: ExpectedConcept;
  hit: boolean;
  /** Transcript excerpt around the match (copied from the transcript). */
  evidence: string | null;
  depth: ConceptDepth | null;
  /** The match relied on reading a likely misrecognised word (e.g. "cash" as "cache"). */
  viaAlias: RecognitionAlias | null;
  /** Where the first mention falls in the answer, from 0 (start) to 1 (end). */
  position: number | null;
  /** Index of the first matched word in the aligned transcript. */
  wordIndex: number | null;
  /** Matched inside a statement flagged as a possible misconception. */
  contradicted?: boolean;
}

/** First and last word index of the sentence containing a word, when the recogniser added punctuation. */
function sentenceBounds(a: AlignedTranscript, index: number): [number, number] {
  const ends = (w: number) => /[.!?]['"”’)]*$/.test(a.tokens[a.tokenOf[w]!] ?? '') && a.tokenOf[w + 1] !== a.tokenOf[w];
  let start = index;
  while (start > 0 && !ends(start - 1)) start--;
  let end = index;
  while (end < a.words.length - 1 && !ends(end)) end++;
  return [start, end];
}

function depthAround(a: AlignedTranscript, index: number, termLength: number): ConceptDepth {
  // Look for an explaining word near the term, but never across a sentence boundary.
  const [sStart, sEnd] = sentenceBounds(a, index);
  const from = Math.max(sStart, index - DEPTH_WINDOW);
  const to = Math.min(sEnd + 1, index + termLength + DEPTH_WINDOW);
  for (let i = from; i < to; i++) {
    if (i >= index && i < index + termLength) continue;
    if (EXPLANATION_MARKERS.has(a.words[i]!)) return 'explained';
  }
  return 'named';
}

function locate(a: AlignedTranscript, term: string): number {
  const exact = findPhrase(a, term);
  if (exact >= 0) return exact;
  // normaliseForMatching turns "big O of n" into "o n"; allow the dropped "of" when searching the original.
  const withOf = term.replace(/^(o|log) /, '$1 of ');
  return withOf === term ? -1 : findPhrase(a, withOf);
}

export function conceptEvidence(
  concepts: readonly ExpectedConcept[],
  transcript: string,
  options: { aliases: boolean },
): { results: ConceptEvidence[]; aliasesApplied: RecognitionAlias[] } {
  const a = alignTranscript(transcript);
  const normalised = normaliseForMatching(transcript);
  const aliased = options.aliases ? applyAliases(normalised) : { text: normalised, applied: [] };
  const used = new Set<RecognitionAlias>();

  const results = concepts.map((concept): ConceptEvidence => {
    let term = findKeyword(normalised, concept.keywords);
    let viaAlias: RecognitionAlias | null = null;
    if (!term && aliased.applied.length > 0) {
      term = findKeyword(aliased.text, concept.keywords);
      if (term) {
        viaAlias = aliased.applied.find((al) => term!.includes(al.meant) || al.meant.includes(term!)) ?? aliased.applied[0]!;
        if (!viaAlias.silent) used.add(viaAlias);
      }
    }
    if (!term) return { concept, hit: false, evidence: null, depth: null, viaAlias: null, position: null, wordIndex: null };
    const searchFor = viaAlias ? viaAlias.heard : term;
    const index = locate(a, searchFor);
    if (index < 0) return { concept, hit: true, evidence: null, depth: 'explained', viaAlias, position: null, wordIndex: null };
    const length = searchFor.split(' ').length;
    return {
      concept,
      hit: true,
      evidence: excerptForWords(a, index, index + length - 1, 6),
      depth: depthAround(a, index, length),
      viaAlias,
      position: a.words.length > 0 ? index / a.words.length : null,
      wordIndex: index,
    };
  });
  return { results, aliasesApplied: [...used] };
}

// ---------------------------------------------------------------------------------------------
// Misconceptions: narrow patterns for common wrong claims, with a guard against refutations.
// ---------------------------------------------------------------------------------------------

const NEGATIONS = new Set(['not', 'no', 'never', 'doesnt', 'dont', 'isnt', 'arent', 'cant', 'cannot', 'wont', 'wasnt', 'shouldnt']);
const REFUTATIONS = new Set(['myth', 'misconception', 'misconceptions', 'wrong', 'incorrect', 'false', 'mistake', 'misunderstanding', 'untrue', 'contrary']);
/** "people think…" reports someone else's belief; "I think…" asserts it, so only these subjects count. */
const BELIEF_VERBS = new Set(['think', 'believe', 'assume', 'claim', 'say']);
const OTHER_PEOPLE = new Set(['people', 'many', 'some', 'beginners', 'developers', 'folks', 'often', 'commonly', 'sometimes']);
const LOOKBEHIND = 5;

export interface DetectedMisconception {
  misconception: Misconception;
  /** The matching transcript text, copied from the transcript. */
  excerpt: string;
  /** First and last aligned word of the match. */
  span: [number, number];
}

/** True when the speaker is reporting or rejecting the claim ("a common myth is that…", "it is not true that…"). */
function isRefuted(a: AlignedTranscript, from: number, to: number, negatedPattern: boolean): boolean {
  for (let i = Math.max(0, from - LOOKBEHIND); i < from; i++) {
    const w = a.words[i]!;
    if (REFUTATIONS.has(w)) return true;
    if (NEGATIONS.has(w) && from - i <= 3) return true;
    if (BELIEF_VERBS.has(w) && i > 0 && OTHER_PEOPLE.has(a.words[i - 1]!)) return true;
  }
  if (!negatedPattern) {
    for (let i = from; i <= to; i++) if (NEGATIONS.has(a.words[i]!)) return true;
  }
  return false;
}

export function detectMisconceptions(
  question: Pick<Question, 'title' | 'prompt'>,
  transcript: string,
  topic: TopicProfile,
): DetectedMisconception[] {
  const a = alignTranscript(transcript);
  if (a.words.length === 0) return [];
  const questionText = ` ${alignTranscript(`${question.title} ${question.prompt}`).text} `;
  const spoken = ` ${a.text} `;
  const found: DetectedMisconception[] = [];
  for (const m of topic.misconceptions) {
    if (m.when && !m.when.some((w) => questionText.includes(w))) continue;
    if (m.unless?.some((u) => spoken.includes(` ${u} `) || spoken.includes(` ${u}`))) continue;
    const re = new RegExp(m.pattern.source, 'g');
    for (const match of a.text.matchAll(re)) {
      const from = wordAtChar(a, match.index);
      const to = wordAtChar(a, match.index + match[0].length - 1);
      if (isRefuted(a, from, to, !!m.negated)) continue;
      found.push({ misconception: m, excerpt: excerptForWords(a, from, to), span: [from, to] });
      break;
    }
  }
  return found;
}

/**
 * A concept matched inside a statement that may be a misconception is not evidence of understanding:
 * "goroutines are OS threads" mentions OS threads but gets the scheduler wrong. Such matches are downgraded
 * to "named" so they earn only partial credit and are never praised.
 */
export function discountContradicted(results: ConceptEvidence[], found: readonly DetectedMisconception[]): ConceptEvidence[] {
  if (found.length === 0) return results;
  return results.map((r) =>
    r.hit && r.wordIndex !== null && found.some((f) => r.wordIndex! >= f.span[0] && r.wordIndex! <= f.span[1])
      ? { ...r, depth: 'named' as const, contradicted: true }
      : r,
  );
}
