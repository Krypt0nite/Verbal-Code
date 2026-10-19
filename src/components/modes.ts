import type { PracticeMode } from '../domain/types';

export const MODE_INFO: Record<PracticeMode, { label: string; blurb: string }> = {
  'off-the-cuff': { label: 'Off the cuff', blurb: 'A random topic, no preparation, speak straight away.' },
  interview: { label: 'Interview', blurb: 'Interview questions scored with topic-specific rubrics.' },
  'deep-research': { label: 'Deep research', blurb: 'Prepare with curated notes, then deliver a considered answer.' },
  'mock-interview': { label: 'Mock interview', blurb: 'A short sequence of questions back to back.' },
};
