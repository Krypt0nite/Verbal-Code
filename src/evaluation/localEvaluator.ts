import type { Question } from '../domain/types';
import { getRubric, type RubricCriterion } from './rubrics';
import {
  countFillers,
  excerptAround,
  findExampleMarkers,
  findKeyword,
  findSignposts,
  lexicalVariety,
  normaliseForMatching,
  openingWarmUp,
  promptOverlap,
  repeatedPhrases,
  sentenceStats,
  words,
} from './analysis';
import { findGrammarIssues, findVagueWords } from './grammar';
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

interface Context {
  question: Question;
  transcript: string;
  normalised: string;
  metrics: TranscriptMetrics;
  grammar: Correction[];
  vague: ReturnType<typeof findVagueWords>;
  conceptHits: Map<string, { label: string; evidence: string } | null>;
}

function scoreCriterion(criterion: RubricCriterion, ctx: Context): CriterionResult {
  const base = { id: criterion.id, label: criterion.label };
  const per100 = (n: number) => (n / Math.max(1, ctx.metrics.wordCount)) * 100;

  switch (criterion.localSignal) {
    case 'concepts': {
      const concepts = ctx.question.expectedConcepts.filter((c) => c.criterion === criterion.id);
      if (concepts.length === 0) {
        return { ...base, score: null, confidence: 'not-assessed', evidence: [], note: 'No reference concepts are defined for this criterion.' };
      }
      const hits = concepts.map((c) => ctx.conceptHits.get(c.id)).filter((h): h is { label: string; evidence: string } => !!h);
      const missing = concepts.filter((c) => !ctx.conceptHits.get(c.id)).map((c) => c.label);
      return {
        ...base,
        score: clamp((hits.length / concepts.length) * 100),
        confidence: 'heuristic',
        evidence: hits.map((h) => `${h.label}: “${h.evidence}”`).slice(0, 4),
        note:
          missing.length === 0
            ? `Mentioned all ${concepts.length} reference point${concepts.length === 1 ? '' : 's'} (keyword match — accuracy not verified).`
            : `Mentioned ${hits.length} of ${concepts.length}. Not detected: ${missing.join('; ')}.`,
      };
    }
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
      const conceptRatio = concepts.length ? [...ctx.conceptHits.values()].filter(Boolean).length / concepts.length : null;
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

function buildNextSteps(criteria: CriterionResult[], missing: string[], metrics: TranscriptMetrics): string[] {
  const steps: string[] = [];
  const weakest = criteria
    .filter((c) => c.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 2);
  if (missing.length > 0) {
    steps.push(`Retry and deliberately cover: ${missing.slice(0, 3).join('; ')}.`);
  }
  for (const w of weakest) {
    if (steps.length >= 3) break;
    if ((w.score ?? 100) >= 80) continue;
    const advice: Record<string, string> = {
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
    const tip = advice[w.id];
    if (tip && !steps.includes(tip)) steps.push(tip);
  }
  if (steps.length < 2 && metrics.wordsPerMinute !== null && (metrics.wordsPerMinute < 100 || metrics.wordsPerMinute > 170)) {
    steps.push(
      metrics.wordsPerMinute < 100
        ? `Your transcript shows about ${metrics.wordsPerMinute} words per minute; practise keeping momentum (around 120–160 is typical for clear explanations).`
        : `Your transcript shows about ${metrics.wordsPerMinute} words per minute; slow down slightly so listeners can follow.`,
    );
  }
  if (steps.length < 2) steps.push('Compare your answer with the model answer below, then retry with a harder difficulty.');
  return steps.slice(0, 3);
}

export function evaluateLocally({ question, transcript, spokenMs }: EvaluationInput): FeedbackReport {
  const rubric = getRubric(question.rubricId);
  const metrics = computeMetrics(transcript, spokenMs);
  const normalised = normaliseForMatching(transcript);
  const conceptHits = new Map<string, { label: string; evidence: string } | null>();
  for (const c of question.expectedConcepts) {
    const term = findKeyword(normalised, c.keywords);
    conceptHits.set(c.id, term ? { label: c.label, evidence: excerptAround(transcript, term) } : null);
  }
  const grammar = findGrammarIssues(transcript);
  const vague = findVagueWords(transcript);
  const ctx: Context = { question, transcript, normalised, metrics, grammar, vague, conceptHits };

  const criteria = rubric.criteria.map((cr) => scoreCriterion(cr, ctx));
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

  const covered = question.expectedConcepts
    .map((c) => conceptHits.get(c.id))
    .filter((h): h is { label: string; evidence: string } => !!h);
  const missing = question.expectedConcepts.filter((c) => !conceptHits.get(c.id)).map((c) => c.label);

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
  if (sp.sequence.length === 0) structureNotes.push('No sequencing words detected ("first", "then", "finally"). Ordering your points makes them easier to follow.');
  if (sp.summary.length === 0) structureNotes.push('No closing summary detected. End with one sentence that restates your answer.');
  if (sp.contrast.length === 0 && ['system-design', 'technical-concept', 'dsa'].includes(question.rubricId)) {
    structureNotes.push('No contrast or trade-off language detected ("however", "the trade-off is"). Interviewers look for trade-offs.');
  }
  const warm = openingWarmUp(transcript);
  if (warm) structureNotes.push(`You opened with “${warm}”. Lead with the answer instead.`);

  const summaryParts = [
    `${metrics.wordCount} words${metrics.wordsPerMinute ? ` at about ${metrics.wordsPerMinute} words per minute` : ''}.`,
    question.expectedConcepts.length ? `Covered ${covered.length} of ${question.expectedConcepts.length} reference points.` : '',
    grammar.length ? `${grammar.length} wording issue${grammar.length === 1 ? '' : 's'} flagged.` : 'No wording issues flagged by the rule set.',
  ];

  return {
    evaluator: 'local',
    evaluatorLabel: 'Local evaluator (on this device, rule-based)',
    rubricId: question.rubricId,
    overallScore,
    summary: summaryParts.filter(Boolean).join(' '),
    criteria,
    metrics,
    corrections: [...grammar, ...vague.corrections].slice(0, 10),
    concisenessNotes: concisenessNotes.slice(0, 6),
    structureNotes: structureNotes.slice(0, 6),
    conceptsCovered: covered,
    conceptsMissing: missing,
    factualConcerns: [],
    improvedAnswer: question.modelAnswer,
    nextSteps: buildNextSteps(criteria, missing, metrics),
    limitations: [
      'Scores come from transcript text only — not from audio. Pronunciation, tone, confidence and pauses are not measured.',
      'Concepts are detected by keyword matching: mentioning a term does not prove it was explained correctly, and correct explanations in other words may be missed.',
      'The local evaluator cannot check facts. Compare your answer with the model answer, or enable AI evaluation for a factual review.',
      'Speech recognition errors can cause false grammar flags and missed concepts.',
    ],
  };
}

export const localEvaluator: Evaluator = {
  id: 'local',
  evaluate: async (input) => evaluateLocally(input),
};
