import taxonomy from '../../data/taxonomy.json';
import { buildQuestionBank, type QuestionBank } from './repository';

const files = import.meta.glob('../../data/questions/*.json', { eager: true, import: 'default' });

/** The application's question bank, validated once at startup. */
export const questionBank: QuestionBank = buildQuestionBank(
  taxonomy,
  Object.entries(files).map(([source, data]) => ({ source: source.split('/').pop() ?? source, data })),
);

if (questionBank.issues.length > 0) {
  console.warn('[VerbalCode] Some questions failed validation and were skipped:', questionBank.issues);
}
