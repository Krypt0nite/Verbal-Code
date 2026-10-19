import type { Correction } from './types';

/**
 * A small, deliberately conservative rule set. Each rule targets a pattern that is almost always an
 * error (or clearly non-standard phrasing) in spoken technical English. It is NOT a full grammar
 * checker, and recognition errors can create false positives — the report says so.
 */
interface Rule {
  kind: Correction['kind'];
  pattern: RegExp;
  fix: (match: RegExpExecArray) => string | null;
  explanation: string;
}

const VOWEL_SOUND_EXCEPTIONS = /^(one|once|uni|use|usu|user|eu|ur[ai]|ut)/;
const SILENT_H = /^(hour|honest|honou?r|heir)/;
/** Expected article for the following word, or null when unsure. */
export function articleFor(word: string): 'a' | 'an' | null {
  if (word.length >= 2 && word === word.toUpperCase() && /^[A-Z]/.test(word)) {
    // Acronyms are read letter by letter: "an HTTP", "a URL", "an SQL".
    return 'AEFHILMNORSX'.includes(word[0]!) ? 'an' : 'a';
  }
  const lower = word.toLowerCase();
  if (lower.length < 2) return null;
  if (SILENT_H.test(lower)) return 'an';
  if (/^[aeiou]/.test(lower)) return VOWEL_SOUND_EXCEPTIONS.test(lower) ? 'a' : 'an';
  return 'a';
}

function matchCase(word: string, like: string): string {
  return like[0] === like[0]!.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word;
}

const IRREGULAR_PAST: Record<string, string> = {
  went: 'go', came: 'come', did: 'do', saw: 'see', made: 'make', took: 'take', wrote: 'write',
  got: 'get', gave: 'give', knew: 'know', thought: 'think', found: 'find', told: 'tell', ran: 'run',
  began: 'begin', broke: 'break', chose: 'choose', felt: 'feel', kept: 'keep', left: 'leave', said: 'say',
};
const COUNTABLE_PLURALS =
  'errors|bugs|requests|servers|users|queries|lines|steps|calls|connections|items|tests|nodes|threads|machines|features|people|mistakes|options|instances';

const RULES: Rule[] = [
  {
    kind: 'grammar',
    pattern: /\b([Aa]n?) ([A-Za-z][A-Za-z0-9]*)\b/g,
    fix: (m) => {
      const expected = articleFor(m[2]!);
      return expected && expected !== m[1]!.toLowerCase() ? `${matchCase(expected, m[1]!)} ${m[2]}` : null;
    },
    explanation: 'Use "an" before a vowel sound and "a" before a consonant sound.',
  },
  {
    kind: 'grammar',
    pattern: /\b(he|she|it|this|that) don'?t\b/gi,
    fix: (m) => `${m[1]} doesn't`,
    explanation: 'Third-person singular subjects take "doesn\'t".',
  },
  {
    kind: 'grammar',
    pattern: /\b(i|we|they|you) doesn'?t\b/gi,
    fix: (m) => `${m[1]} don't`,
    explanation: 'Use "don\'t" with I, you, we and they.',
  },
  {
    kind: 'grammar',
    pattern: /\b(he|she|it) have\b(?! to)/gi,
    fix: (m) => `${m[1]} has`,
    explanation: 'Third-person singular subjects take "has".',
  },
  {
    kind: 'grammar',
    pattern: /\bthere is (many|two|three|several|multiple|a lot of|lots of)\b/gi,
    fix: (m) => `there are ${m[1]}`,
    explanation: 'Use "there are" with plural nouns.',
  },
  {
    kind: 'grammar',
    pattern: new RegExp(`\\b(didn'?t|did not|doesn'?t|does not) (${Object.keys(IRREGULAR_PAST).join('|')})\\b`, 'gi'),
    fix: (m) => `${m[1]} ${IRREGULAR_PAST[m[2]!.toLowerCase()]}`,
    explanation: 'After "did not" or "does not", use the base form of the verb.',
  },
  {
    kind: 'grammar',
    pattern: /\b(more|most) (better|worse|faster|slower|easier|harder|simpler|bigger|smaller|best|fastest|easiest|simplest)\b/gi,
    fix: (m) => m[2]!,
    explanation: 'Avoid double comparatives such as "more faster".',
  },
  {
    kind: 'grammar',
    pattern: new RegExp(`\\bless (${COUNTABLE_PLURALS})\\b`, 'gi'),
    fix: (m) => `fewer ${m[1]}`,
    explanation: 'Use "fewer" with countable nouns.',
  },
  {
    kind: 'phrasing',
    pattern: /\b(can|could) able to\b/gi,
    fix: (m) => (m[1]!.toLowerCase() === 'can' ? 'can' : 'could'),
    explanation: '"Can able to" is non-standard; use "can" or "am able to".',
  },
  {
    kind: 'phrasing',
    pattern: /\b(discuss|explain|describe) about\b/gi,
    fix: (m) => m[1]!,
    explanation: `"Discuss", "explain" and "describe" don't need "about".`,
  },
  {
    kind: 'phrasing',
    pattern: /\b(revert|return|repeat) (back|again)\b/gi,
    fix: (m) => m[1]!,
    explanation: 'The verb already includes the meaning of "back"/"again".',
  },
  {
    kind: 'phrasing',
    pattern: /\bcope up with\b/gi,
    fix: () => 'cope with',
    explanation: 'The standard phrase is "cope with".',
  },
  {
    kind: 'phrasing',
    pattern: /\bcomprises? of\b/gi,
    fix: () => 'consists of',
    explanation: 'Use "comprises" or "consists of", not "comprises of".',
  },
  {
    kind: 'phrasing',
    pattern: /\b(the|a|is|are|was|it|we|i|to|and|of) \1\b/gi,
    fix: (m) => m[1]!,
    explanation: 'Repeated word — usually a restart mid-sentence. Pause briefly instead of repeating.',
  },
];

function contextAround(text: string, index: number, length: number): { before: string; start: number; end: number } {
  const startWindow = text.lastIndexOf(' ', Math.max(0, index - 25));
  const start = startWindow === -1 ? 0 : startWindow + 1;
  const endWindow = text.indexOf(' ', Math.min(text.length, index + length + 20));
  const end = endWindow === -1 ? text.length : endWindow;
  return { before: text.slice(start, end), start, end };
}

export function findGrammarIssues(text: string, limit = 6): Correction[] {
  const found: Array<Correction & { index: number }> = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const replacement = rule.fix(m);
      if (replacement === null) continue;
      const key = m[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const ctx = contextAround(text, m.index, m[0].length);
      const offset = m.index - ctx.start;
      const after = ctx.before.slice(0, offset) + replacement + ctx.before.slice(offset + m[0].length);
      found.push({ kind: rule.kind, before: ctx.before, after, explanation: rule.explanation, index: m.index });
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .slice(0, limit)
    .map(({ index: _index, ...c }) => c);
}

const VAGUE: Record<string, string> = {
  thing: 'name the specific component, step or concept',
  things: 'name the specific components, steps or concepts',
  stuff: 'name what you mean (data, requests, files…)',
  'a lot': 'give a number or an order of magnitude',
  very: 'use a stronger, precise word or a measurement',
  really: 'drop it, or replace it with a measurement',
  good: 'say what makes it good: faster, safer, cheaper, simpler',
  bad: 'say what goes wrong: slower, error-prone, insecure',
  big: 'quantify it: how many rows, requests or bytes',
  nice: 'say what the benefit is',
};

export function findVagueWords(text: string, limit = 3): { corrections: Correction[]; counts: Record<string, number> } {
  const lower = ` ${text.toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  const counts: Record<string, number> = {};
  for (const term of Object.keys(VAGUE)) {
    const n = lower.split(` ${term} `).length - 1;
    if (n > 0) counts[term] = n;
  }
  // Group terms that occur in the same stretch of speech so one sentence yields one suggestion.
  const groups = new Map<string, string[]>();
  for (const [term] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const idx = text.toLowerCase().search(new RegExp(`\\b${term}\\b`));
    const ctx = idx >= 0 ? contextAround(text, idx, term.length).before : term;
    const key = [...groups.keys()].find((k) => k.includes(ctx) || ctx.includes(k)) ?? ctx;
    groups.set(key, [...(groups.get(key) ?? []), term]);
  }
  const corrections: Correction[] = [...groups.entries()].slice(0, limit).map(([ctx, terms]) => ({
    kind: 'vocabulary' as const,
    before: ctx,
    after: terms.map((t) => `Instead of "${t}", ${VAGUE[t]}.`).join(' '),
    explanation: `${terms.map((t) => `"${t}" ×${counts[t]}`).join(', ')} in your answer. Precise wording sounds more confident in interviews.`,
  }));
  return { corrections, counts };
}
