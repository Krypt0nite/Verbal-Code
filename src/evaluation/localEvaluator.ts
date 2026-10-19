import type { Question } from '../domain/types';
import type { RubricCriterion } from './rubrics';
import {
  countFillers,
  excerptAround,
  findExampleMarkers,
  findSignposts,
  lexicalVariety,
  openingWarmUp,
  promptOverlap,
  repeatedPhrases,
  sentenceStats,
  words,
} from './analysis';
import { conceptEvidence, detectMisconceptions, discountContradicted, type ConceptEvidence, type DetectedMisconception, type RecognitionAlias } from './evidence';
import { findGrammarIssues, findVagueWords } from './grammar';
import { resolveRubric, selectTopic, type TopicProfile } from './topics';
import type { Correction, CriterionResult, FeedbackReport, TranscriptMetrics } from './types';

export interface EvaluationInput {
  question: Question;
  transcript: string;
  spokenMs: number;
}

export interface Evaluator {
  readonly id: 'local' | 'ai';
  evaluate(input: EvaluationInput, signal?: AbortSignal): Promise<FeedbackReport>;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
/** Shortens text to a schema limit, so long concept lists never make a report invalid. */
const fit = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** Rubrics where answers are technical explanations; depth, misconceptions and recognition aliases apply. */
const TECHNICAL_RUBRICS = new Set(['dsa', 'system-design', 'programming-language', 'technical-concept']);

/** Credit for a concept that was named without any explanation around it. */
export const NAMED_ONLY_CREDIT = 0.6;
/** A short answer is expected to cover at least this share of a criterion's reference points. */
export const MIN_COVERAGE_TARGET = 0.5;
/** Points removed from the main correctness criterion per detected misconception, capped. */
const MISCONCEPTION_PENALTY = { likely: 20, possible: 10 } as const;
const MAX_MISCONCEPTION_PENALTY = 40;

export function computeMetrics(transcript: string, spokenMs: number): TranscriptMetrics {
  const count = words(transcript).length;
  const fillers = countFillers(transcript);
  const sentences = sentenceStats(transcript);
  const durationSec = Math.round(spokenMs / 100) / 10;
  return {
    wordCount: count,
    durationSec,
    wordsPerMinute: spokenMs >= 10000 ? Math.round(count / (spokenMs / 60000)) : null,
    sentenceCount: sentences?.count ?? null,
    averageSentenceLength: sentences?.average ?? null,
    fillers,
    fillerCount: fillers.reduce((s, f) => s + f.count, 0),
    repeatedPhrases: repeatedPhrases(transcript),
    lexicalVariety: lexicalVariety(transcript),
  };
}

/**
 * Share of a criterion's reference points a full answer is expected to cover. Prompts often ask for more
 * than fits in the time spoken: a 60 s answer to a question suggested at 180 s is expected to cover about
 * half of each criterion's points, never less than MIN_COVERAGE_TARGET.
 */
export function coverageTarget(question: Question, spokenMs: number, technical: boolean): number {
  if (!technical || question.suggestedDurationSec <= 0) return 1;
  return Math.max(MIN_COVERAGE_TARGET, Math.min(1, spokenMs / 1000 / question.suggestedDurationSec));
}

interface Context {
  question: Question;
  transcript: string;
  metrics: TranscriptMetrics;
  grammar: Correction[];
  vague: ReturnType<typeof findVagueWords>;
  concepts: Map<string, ConceptEvidence>;
  technical: boolean;
  target: number;
}

function quote(e: ConceptEvidence): string {
  const text = `${e.concept.label}: “${e.evidence ?? e.concept.label}”`;
  if (e.contradicted) return `${text} (in a statement that may be wrong)`;
  return e.depth === 'named' ? `${text} (named, not explained)` : text;
}

function scoreConcepts(criterion: RubricCriterion, ctx: Context): CriterionResult {
  const base = { id: criterion.id, label: criterion.label };
  const results = ctx.question.expectedConcepts.filter((c) => c.criterion === criterion.id).map((c) => ctx.concepts.get(c.id)!);
  if (results.length === 0) {
    return { ...base, score: null, confidence: 'not-assessed', evidence: [], note: 'No reference concepts are defined for this criterion.' };
  }
  const hits = results.filter((r) => r.hit);
  const named = hits.filter((r) => r.depth === 'named');
  const missing = results.filter((r) => !r.hit).map((r) => r.concept.label);
  const credit = hits.reduce((s, r) => s + (ctx.technical && r.depth === 'named' ? NAMED_ONLY_CREDIT : 1), 0);
  const required = Math.max(1, Math.ceil(results.length * ctx.target));
  const notes = [`Covered ${hits.length} of ${results.length} reference point${results.length === 1 ? '' : 's'} (keyword match; accuracy not verified).`];
  if (ctx.technical && named.length) notes.push(`${named.length} only named, without an explanation around ${named.length === 1 ? 'it' : 'them'}.`);
  if (required < results.length) notes.push(`For the time you spoke, ${required} well-explained point${required === 1 ? '' : 's'} earn full marks.`);
  if (missing.length) {
    const shown = missing.slice(0, 3);
    notes.push(`Not detected: ${shown.join('; ')}${missing.length > shown.length ? ` and ${missing.length - shown.length} more` : ''}.`);
  }
  return {
    ...base,
    score: clamp(Math.min(1, credit / required) * 100),
    confidence: 'heuristic',
    evidence: hits.map((h) => fit(quote(h), 300)).slice(0, 4),
    note: fit(notes.join(' '), 400),
  };
}

function scoreCriterion(criterion: RubricCriterion, ctx: Context): CriterionResult {
  const base = { id: criterion.id, label: criterion.label };
  const per100 = (n: number) => (n / Math.max(1, ctx.metrics.wordCount)) * 100;

  switch (criterion.localSignal) {
    case 'concepts':
      return scoreConcepts(criterion, ctx);
    case 'structure': {
      const sp = findSignposts(ctx.transcript);
      const kinds = (Object.keys(sp) as Array<keyof typeof sp>).filter((k) => sp[k].length > 0);
      const used = kinds.flatMap((k) => sp[k].slice(0, 2));
      return {
        ...base,
        score: clamp(25 + kinds.length * 20),
        confidence: 'heuristic',
        evidence: used.length ? [`Signposts used: ${used.map((u) => `“${u}”`).join(', ')}`] : ['No sequencing, cause, contrast or summary signposts detected.'],
        note: `Used ${kinds.length} of 4 signpost types (sequence, cause, contrast, summary). Signposting makes spoken answers easier to follow.`,
      };
    }
    case 'examples': {
      const markers = findExampleMarkers(ctx.transcript);
      return {
        ...base,
        score: markers.length >= 2 ? 100 : markers.length === 1 ? 80 : 30,
        confidence: 'heuristic',
        evidence: markers.map((m) => `“${excerptAround(ctx.transcript, m)}”`).slice(0, 2),
        note: markers.length
          ? 'An explicit example was introduced.'
          : 'No explicit example marker ("for example", "imagine", "let\'s say") was detected. You may have used an example without one.',
      };
    }
    case 'grammar': {
      const issues = ctx.grammar.filter((g) => g.kind !== 'vocabulary').length;
      return {
        ...base,
        score: clamp(95 - per100(issues) * 12),
        confidence: 'heuristic',
        evidence: [`${issues} issue${issues === 1 ? '' : 's'} flagged in ${ctx.metrics.wordCount} words by a limited rule set.`],
        note: issues === 0
          ? 'No issues found by the rule set. This is not a full grammar check, and recognition errors are possible.'
          : 'See the corrections below. Some flags may be caused by recognition errors.',
      };
    }
    case 'vocabulary': {
      const variety = ctx.metrics.lexicalVariety;
      if (variety === null) {
        return { ...base, score: null, confidence: 'not-assessed', evidence: [], note: 'Too few content words to judge vocabulary.' };
      }
      const vagueCount = Object.values(ctx.vague.counts).reduce((s, n) => s + n, 0);
      const score = clamp(((variety - 0.5) / 0.35) * 100 - per100(vagueCount) * 6);
      return {
        ...base,
        score,
        confidence: 'heuristic',
        evidence: [`Lexical variety ${variety.toFixed(2)} (share of distinct content words)`, `${vagueCount} vague word${vagueCount === 1 ? '' : 's'} (thing, stuff, very, good…)`],
        note: 'Variety and precise wording, measured from text only.',
      };
    }
    case 'conciseness': {
      const repeats = ctx.metrics.repeatedPhrases.reduce((s, r) => s + r.count - 1, 0);
      const rate = per100(ctx.metrics.fillerCount + repeats);
      return {
        ...base,
        score: clamp(100 - rate * 8),
        confidence: 'heuristic',
        evidence: [
          ctx.metrics.fillers.length ? `Fillers: ${ctx.metrics.fillers.map((f) => `“${f.term}” ×${f.count}`).join(', ')}` : 'No filler words detected in the transcript.',
          ...(ctx.metrics.repeatedPhrases.length ? [`Repeated: ${ctx.metrics.repeatedPhrases.slice(0, 3).map((r) => `“${r.phrase}” ×${r.count}`).join(', ')}`] : []),
        ],
        note: 'Speech recognisers often drop "um" and "uh", so filler counts are a lower bound.',
      };
    }
    case 'directness': {
      const warm = openingWarmUp(ctx.transcript);
      const firstWords = words(ctx.transcript).slice(0, 15).join(' ');
      const overlap = promptOverlap(ctx.question.prompt, firstWords);
      const score = clamp((warm ? 40 : 70) + Math.min(30, overlap.shared.length * 15));
      return {
        ...base,
        score,
        confidence: 'heuristic',
        evidence: [`Opening: “${ctx.transcript.split(/\s+/).slice(0, 15).join(' ')}…”`],
        note: warm
          ? `Opened with a warm-up phrase (“${warm}”). Start with your answer instead.`
          : overlap.shared.length
            ? 'Your opening engages the question directly.'
            : 'Your opening does not reuse the key terms of the question; state your answer in the first sentence.',
      };
    }
    case 'relevance': {
      const overlap = promptOverlap(ctx.question.prompt, ctx.transcript);
      const concepts = ctx.question.expectedConcepts;
      const conceptRatio = concepts.length ? [...ctx.concepts.values()].filter((c) => c.hit).length / concepts.length : null;
      const ratio = conceptRatio === null ? overlap.ratio : (overlap.ratio + conceptRatio) / 2;
      return {
        ...base,
        score: clamp(20 + ratio * 100),
        confidence: 'heuristic',
        evidence: [overlap.shared.length ? `Key terms from the question you used: ${overlap.shared.slice(0, 6).join(', ')}` : 'Few key terms from the question appear in the answer.'],
        note: 'Estimated from shared key terms; it cannot judge whether the reasoning is correct.',
      };
    }
  }
}

/** The concept criterion that carries the most weight (correctness, requirements, accuracy…). */
function primaryCriterion(criteria: readonly RubricCriterion[]): RubricCriterion | undefined {
  return [...criteria].filter((c) => c.localSignal === 'concepts').sort((a, b) => b.weight - a.weight)[0];
}

/** Lowers the primary criterion when misconceptions were found, and says so in its note. */
function applyMisconceptionPenalty(criteria: CriterionResult[], primaryId: string | undefined, found: DetectedMisconception[]): void {
  const target = criteria.find((c) => c.id === primaryId);
  if (!target || target.score === null || found.length === 0) return;
  const penalty = Math.min(MAX_MISCONCEPTION_PENALTY, found.reduce((s, f) => s + MISCONCEPTION_PENALTY[f.misconception.certainty], 0));
  target.score = clamp(target.score - penalty);
  // Put the penalty first so truncation never hides it.
  const plural = found.length === 1 ? '' : 's';
  target.note = fit(`Lowered by ${penalty} for ${found.length} possible misconception${plural} (see "Possible factual issues"). ${target.note}`, 400);
}

function buildStrengths(ctx: Context, topic: TopicProfile): string[] {
  const out: string[] = [];
  const explained = [...ctx.concepts.values()].filter((c) => c.hit && c.depth === 'explained' && c.evidence);
  for (const c of explained.slice(0, 2)) out.push(`Explained well (${c.concept.label}): “${c.evidence}”`);
  const example = findExampleMarkers(ctx.transcript)[0];
  if (example) out.push(`You grounded the answer in an example: “${excerptAround(ctx.transcript, example)}”`);
  const sp = findSignposts(ctx.transcript);
  if (sp.sequence.length && sp.summary.length) out.push(`Clear structure: you ordered your points (“${sp.sequence[0]}”) and closed with a summary (“${sp.summary[0]}”).`);
  if (ctx.metrics.wordCount >= 60 && ctx.metrics.fillerCount === 0) out.push('No filler words were detected in your transcript.');
  if (out.length === 0 && ctx.technical && explained.length === 0 && [...ctx.concepts.values()].some((c) => c.hit)) {
    out.push(`You touched the right ${topic.label} topics; the next step is explaining them, not just naming them.`);
  }
  return out.slice(0, 4).map((x) => fit(x, 300));
}

interface StepInput {
  criteria: CriterionResult[];
  missing: string[];
  named: string[];
  misconceptions: DetectedMisconception[];
  metrics: TranscriptMetrics;
  topic: TopicProfile;
  technical: boolean;
}

const ADVICE: Record<string, string> = {
  reasoning: 'Narrate in steps: "First…, then…, finally…". Say why each step works.',
  organization: 'Use a fixed frame: answer → reason → example → trade-off → one-line summary.',
  structure: 'Use a fixed frame: definition → how it works → example → trade-off.',
  examples: 'Add one concrete example starting with "For example…" or "Imagine…".',
  grammar: 'Re-read the corrections aloud twice, then retry the same question.',
  vocabulary: 'Replace vague words (thing, stuff, very) with the precise technical term or a number.',
  conciseness: 'Pause silently instead of using fillers; record again and aim for zero repeated phrases.',
  directness: 'Make your first sentence the answer itself, then elaborate.',
  relevance: 'Restate the question in one line before answering so you stay on target.',
};

/** Two or three concrete actions, most important first: fix wrong claims, then depth, then coverage, then delivery. */
function buildNextSteps({ criteria, missing, named, misconceptions, metrics, topic, technical }: StepInput): string[] {
  const steps: string[] = [];
  const first = misconceptions[0];
  if (first) steps.push(`Check this claim: “${first.excerpt}”. ${first.misconception.correction}`);
  if (technical && named.length) {
    steps.push(`Explain, don't just name: say why ${named.slice(0, 2).join(' and ')} matter${named.length === 1 ? 's' : ''}, using "because…" or "which means…".`);
  }
  if (missing.length && steps.length < 3) steps.push(`Retry and deliberately cover: ${missing.slice(0, 3).join('; ')}.`);
  const weakest = criteria
    .filter((c) => c.score !== null && c.confidence !== 'not-assessed')
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 2);
  for (const w of weakest) {
    if (steps.length >= 3) break;
    if ((w.score ?? 100) >= 80) continue;
    const tip = ADVICE[w.id];
    if (tip && !steps.includes(tip)) steps.push(tip);
  }
  if (steps.length < 2 && metrics.wordsPerMinute !== null && (metrics.wordsPerMinute < 100 || metrics.wordsPerMinute > 170)) {
    steps.push(
      metrics.wordsPerMinute < 100
        ? `Your transcript shows about ${metrics.wordsPerMinute} words per minute; practise keeping momentum (around 120–160 is typical for clear explanations).`
        : `Your transcript shows about ${metrics.wordsPerMinute} words per minute; slow down slightly so listeners can follow.`,
    );
  }
  if (steps.length < 2 && technical) steps.push(`Practise the ${topic.label} one-minute frame: ${topic.oneMinuteFrame}`);
  if (steps.length < 2) steps.push('Compare your answer with the model answer below, then retry with a harder difficulty.');
  return steps.slice(0, 3);
}

function recognitionNotes(aliases: RecognitionAlias[]): string[] {
  return aliases.map(
    (a) => `We read “${a.heard}” as “${a.meant}”, which is probably what you said. If you really meant “${a.heard}”, the related point was credited by mistake.`,
  );
}

/** Grammar rules should not "correct" words that were probably misrecognised. */
function withoutRecognitionErrors(corrections: Correction[], aliases: RecognitionAlias[]): Correction[] {
  if (aliases.length === 0) return corrections;
  return corrections.filter((c) => !aliases.some((a) => c.before.toLowerCase().includes(a.heard)));
}

export function evaluateLocally({ question, transcript, spokenMs }: EvaluationInput): FeedbackReport {
  const topic = selectTopic(question);
  const rubric = resolveRubric(question.rubricId, topic.id);
  const technical = TECHNICAL_RUBRICS.has(question.rubricId);
  const metrics = computeMetrics(transcript, spokenMs);
  const misconceptions = detectMisconceptions(question, transcript, topic);
  const evidence = conceptEvidence(question.expectedConcepts, transcript, { aliases: technical });
  const aliasesApplied = evidence.aliasesApplied;
  const results = discountContradicted(evidence.results, misconceptions);
  const concepts = new Map(results.map((r) => [r.concept.id, r]));
  const grammar = withoutRecognitionErrors(findGrammarIssues(transcript), aliasesApplied);
  const vague = findVagueWords(transcript);
  const target = coverageTarget(question, spokenMs, technical);
  const ctx: Context = { question, transcript, metrics, grammar, vague, concepts, technical, target };

  const criteria = rubric.criteria.map((cr) => scoreCriterion(cr, ctx));
  const primary = primaryCriterion(rubric.criteria);
  applyMisconceptionPenalty(criteria, primary?.id, misconceptions);

  let weighted = 0;
  let weights = 0;
  rubric.criteria.forEach((cr, i) => {
    const score = criteria[i]?.score;
    if (score !== null && score !== undefined) {
      weighted += score * cr.weight;
      weights += cr.weight;
    }
  });
  const overallScore = weights > 0 ? clamp(weighted / weights) : null;

  const hits = results.filter((r) => r.hit);
  const covered = hits.map((r) => ({ label: r.concept.label, evidence: r.evidence ?? r.concept.label, ...(technical && r.depth ? { depth: r.depth } : {}) }));
  const named = technical ? hits.filter((r) => r.depth === 'named').map((r) => r.concept.label) : [];
  const missing = results.filter((r) => !r.hit).map((r) => r.concept.label);

  const concisenessNotes: string[] = [];
  if (metrics.fillerCount > 0) {
    concisenessNotes.push(`Detected ${metrics.fillerCount} filler word${metrics.fillerCount === 1 ? '' : 's'}: ${metrics.fillers.map((f) => `“${f.term}” ×${f.count}`).join(', ')}.`);
  }
  for (const r of metrics.repeatedPhrases.slice(0, 3)) {
    concisenessNotes.push(`“${r.phrase}” repeated ${r.count} times — vary the wording or cut repeats.`);
  }
  if (metrics.averageSentenceLength !== null && metrics.averageSentenceLength > 28) {
    concisenessNotes.push(`Average sentence length is about ${metrics.averageSentenceLength} words; shorter sentences are easier to follow when spoken.`);
  }

  const sp = findSignposts(transcript);
  const structureNotes: string[] = [];
  const warm = openingWarmUp(transcript);
  if (warm) structureNotes.push(`You opened with “${warm}”. Lead with the answer instead.`);
  if (technical && primary && metrics.wordCount >= 60) {
    const firstMain = results
      .filter((r) => r.concept.criterion === primary.id && r.position !== null)
      .reduce<number | null>((min, r) => (min === null || r.position! < min ? r.position : min), null);
    if (firstMain !== null && firstMain > 0.5) {
      structureNotes.push('Your main point arrived in the second half of the answer. In a one-minute answer, state it in the first sentence.');
    }
  }
  if (sp.sequence.length === 0) structureNotes.push('No sequencing words detected ("first", "then", "finally"). Ordering your points makes them easier to follow.');
  if (sp.summary.length === 0) structureNotes.push('No closing summary detected. End with one sentence that restates your answer.');
  if (sp.contrast.length === 0 && technical) {
    structureNotes.push('No contrast or trade-off language detected ("however", "the trade-off is"). Interviewers look for trade-offs.');
  }
  if (technical) structureNotes.push(`A strong one-minute ${topic.label} answer: ${topic.oneMinuteFrame}`);

  const summaryParts = [
    `${metrics.wordCount} words${metrics.wordsPerMinute ? ` at about ${metrics.wordsPerMinute} words per minute` : ''}.`,
    question.expectedConcepts.length
      ? `Covered ${hits.length} of ${question.expectedConcepts.length} reference points${named.length ? ` (${named.length} only named)` : ''}.`
      : '',
    misconceptions.length ? `${misconceptions.length} statement${misconceptions.length === 1 ? '' : 's'} may be a common misconception.` : '',
    grammar.length ? `${grammar.length} wording issue${grammar.length === 1 ? '' : 's'} flagged.` : 'No wording issues flagged by the rule set.',
  ];

  const checked = technical ? topic.misconceptions.length : 0;
  const limitations = [
    'Scores come from transcript text only — not from audio. Pronunciation, tone, confidence and pauses are not measured.',
    'Concepts are detected by keyword matching: mentioning a term does not prove it was explained correctly, and correct explanations in other words may be missed.',
    checked > 0
      ? `Factual check: only ${checked} common ${topic.label} misconceptions are matched, so flagged statements may be false alarms and unflagged ones are not verified. The local evaluator cannot check facts beyond that list; compare with the model answer or use AI feedback.`
      : 'The local evaluator cannot check facts. Compare your answer with the model answer, or enable AI evaluation for a factual review.',
    'Speech recognition errors can cause false grammar flags and missed concepts.',
  ];
  if (technical) {
    limitations.push(`"Named, not explained" means no explaining word (because, which, so, when, by…) appeared near the term; such points earn ${Math.round(NAMED_ONLY_CREDIT * 100)}% credit.`);
  }
  if (target < 1) {
    limitations.push(`You spoke for ${Math.round(spokenMs / 1000)} s of a suggested ${question.suggestedDurationSec} s, so each criterion expects about ${Math.round(target * 100)}% of its reference points.`);
  }

  return {
    evaluator: 'local',
    evaluatorLabel: 'Local evaluator (on this device, rule-based)',
    rubricId: question.rubricId,
    rubricLabel: rubric.topicLabel,
    overallScore,
    summary: summaryParts.filter(Boolean).join(' '),
    criteria,
    metrics,
    corrections: [...grammar, ...vague.corrections].slice(0, 10),
    concisenessNotes: concisenessNotes.slice(0, 6),
    structureNotes: structureNotes.slice(0, 6),
    conceptsCovered: covered,
    conceptsMissing: missing,
    factualConcerns: misconceptions
      .map((m) => ({ excerpt: m.excerpt, concern: m.misconception.correction, certainty: m.misconception.certainty }))
      .slice(0, 8),
    strengths: buildStrengths(ctx, topic),
    recognitionNotes: recognitionNotes(aliasesApplied),
    improvedAnswer: question.modelAnswer,
    nextSteps: buildNextSteps({ criteria, missing, named, misconceptions, metrics, topic, technical }),
    limitations: limitations.slice(0, 8),
  };
}

export const localEvaluator: Evaluator = {
  id: 'local',
  evaluate: async (input) => evaluateLocally(input),
};
