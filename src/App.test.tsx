import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { aiConfigured, aiNotConfigured, FakeRecognizer, GOOD_ANSWER } from './test/fakes';
import { RecognitionError } from './speech/types';
import { storageContains } from './privacy/privacy';
import type { Evaluator } from './evaluation/localEvaluator';
import { AiEvaluationError } from './ai/aiEvaluator';

function setup(opts: { recognizer?: FakeRecognizer; ai?: Evaluator; aiStatus?: typeof aiConfigured } = {}) {
  const recognizer = opts.recognizer ?? new FakeRecognizer();
  const user = userEvent.setup();
  render(<App recognizer={recognizer} aiEvaluator={opts.ai} fetchStatus={opts.aiStatus ?? aiNotConfigured} />);
  return { recognizer, user };
}

async function pickDsaQuestion(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Subcategory'), 'dsa');
  await user.click(screen.getByRole('button', { name: /give me a question/i }));
  await screen.findByRole('button', { name: /start speaking/i });
}

describe('App', () => {
  it('starts with an invitation and generates a filtered question', async () => {
    const { user } = setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/explain it out loud/i);
    expect(screen.getByLabelText('Category')).toHaveValue('tech-ai');
    await pickDsaQuestion(user);
    expect(screen.getByText('Data Structures & Algorithms', { selector: '.topic-meta span' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('1:00');
  });

  it('prevents choosing a subcategory without a category', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Category'), '');
    expect(screen.getByLabelText('Subcategory')).toBeDisabled();
  });

  it('runs a full session, shows evidence-based feedback, and keeps transcripts out of storage', async () => {
    const { user, recognizer } = setup();
    await pickDsaQuestion(user);
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    expect(await screen.findByText('Listening.')).toBeInTheDocument();
    expect(screen.getByText('On-device recognition')).toBeInTheDocument();
    expect(recognizer.lastOptions).toEqual({ lang: 'en-US', location: 'local' });

    act(() => recognizer.say(GOOD_ANSWER));
    expect(screen.getByText(/Binary search finds a target/)).toBeInTheDocument();
    expect(storageContains('Binary search finds a target')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    const report = await screen.findByRole('article', { name: 'Feedback' });
    expect(within(report).getByText(/Local evaluator/)).toBeInTheDocument();
    expect(within(report).getByText('Rubric')).toBeInTheDocument();
    expect(within(report).getByText(/How this was scored/)).toBeInTheDocument();
    expect(storageContains('Binary search finds a target')).toBe(false);

    await user.click(screen.getByRole('button', { name: /discard transcript/i }));
    expect(screen.queryByRole('article', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/explain it out loud/i);
    expect(recognizer.session?.aborted).toBe(false); // finished normally, then dropped
  });

  it('asks the user to retry when too little was captured', async () => {
    const { user, recognizer } = setup();
    await pickDsaQuestion(user);
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    await screen.findByText('Listening.');
    act(() => recognizer.say('binary search is fast'));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText(/too little to give honest feedback/i)).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Feedback' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByRole('button', { name: /start speaking/i })).toBeEnabled();
  });

  it('shows a clear error when microphone permission is denied', async () => {
    const recognizer = new FakeRecognizer();
    recognizer.startError = new RecognitionError('not-allowed', 'Microphone access was blocked. Allow the microphone for this site.');
    const { user } = setup({ recognizer });
    await pickDsaQuestion(user);
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Microphone access was blocked/);
    expect(screen.queryByText('Listening.')).not.toBeInTheDocument();
  });

  it('never falls back to cloud recognition without consent', async () => {
    const recognizer = new FakeRecognizer();
    recognizer.capabilities = { supported: true, localApi: false, local: 'unavailable' };
    const { user } = setup({ recognizer });
    await pickDsaQuestion(user);
    expect(screen.getByText(/nothing will be sent anywhere unless you choose cloud recognition/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start speaking/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /use cloud recognition/i }));
    const dialog = screen.getByRole('dialog', { name: /cloud speech service/i });
    await user.click(within(dialog).getByRole('button', { name: /keep on-device only/i }));
    expect(screen.getByRole('button', { name: /start speaking/i })).toBeDisabled();
    expect(recognizer.start).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /use cloud recognition/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^use cloud recognition$/i }));
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    expect(await screen.findByText('Cloud recognition (browser vendor)')).toBeInTheDocument();
    expect(recognizer.lastOptions?.location).toBe('cloud');
  });

  it('cancel during the permission prompt releases the recognizer and clears state', async () => {
    const recognizer = new FakeRecognizer();
    recognizer.holdPermission = true;
    const { user } = setup({ recognizer });
    await pickDsaQuestion(user);
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    expect(screen.getByText(/Waiting for microphone permission/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel attempt/i }));
    await act(async () => recognizer.grant());
    await waitFor(() => expect(recognizer.session?.aborted).toBe(true));
    expect(screen.getByText(/Ready\. Start when you are/)).toBeInTheDocument();
  });

  it('pauses and resumes recognition explicitly', async () => {
    const { user, recognizer } = setup();
    await pickDsaQuestion(user);
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    await screen.findByText('Listening.');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(recognizer.session?.paused).toBe(true);
    expect(screen.getByText(/Browsers can't pause recognition/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(recognizer.session?.paused).toBe(false);
    await user.click(screen.getByRole('button', { name: /cancel attempt/i }));
    expect(recognizer.session?.aborted).toBe(true);
  });

  it('falls back to local feedback when the AI provider fails', async () => {
    const failing: Evaluator = { id: 'ai', evaluate: vi.fn().mockRejectedValue(new AiEvaluationError('rate-limited', 'The AI provider rate limit was reached.')) };
    const { user, recognizer } = setup({ ai: failing, aiStatus: aiConfigured });

    // Turn on AI feedback through the consent flow.
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const ai = await screen.findByRole('checkbox', { name: /AI feedback/i });
    await waitFor(() => expect(ai).toBeEnabled());
    await user.click(ai);
    await user.click(within(screen.getByRole('dialog', { name: /AI feedback/i })).getByRole('button', { name: /turn on ai feedback/i }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await pickDsaQuestion(user);
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    await screen.findByText('Listening.');
    act(() => recognizer.say(GOOD_ANSWER));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rate limit/);
    expect(failing.evaluate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /use local feedback instead/i }));
    const report = await screen.findByRole('article', { name: 'Feedback' });
    expect(within(report).getByText(/Local evaluator/)).toBeInTheDocument();
  });

  it('supports keyboard navigation of modes and closes dialogs with Escape', async () => {
    const { user } = setup();
    const interview = screen.getByRole('radio', { name: 'Interview' });
    interview.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Deep research' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Deep research' })).toHaveFocus();

    const settings = screen.getByRole('button', { name: 'Settings' });
    await user.click(settings);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(settings).toHaveFocus();
  });

  it('shows curated preparation notes in deep research mode and runs a prep timer', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Deep research' }));
    await user.selectOptions(screen.getByLabelText('Subcategory'), 'dsa');
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'beginner');
    await user.click(screen.getByRole('button', { name: /give me a question/i }));
    await user.click(await screen.findByRole('button', { name: /prepare for 5 min/i }));
    expect(screen.getByText('Preparation')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('5:00');
    await user.click(screen.getByRole('button', { name: /end preparation/i }));
    expect(screen.getByText('Speaking time')).toBeInTheDocument();
  });

  it('runs a mock interview sequence', async () => {
    const { user, recognizer } = setup();
    await user.click(screen.getByRole('radio', { name: 'Mock interview' }));
    await user.click(screen.getByRole('button', { name: /start mock interview/i }));
    expect(await screen.findByText('Question 1 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start speaking/i }));
    await screen.findByText('Listening.');
    act(() => recognizer.say(GOOD_ANSWER));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await user.click(await screen.findByRole('button', { name: /next question \(2 of 3\)/i }));
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
  });
});

describe('timer-driven completion', () => {
  it('finishes automatically when time runs out, exactly once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
    try {
      const recognizer = new FakeRecognizer();
      const finishSpy = vi.fn();
      render(<App recognizer={recognizer} fetchStatus={aiNotConfigured} />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await pickDsaQuestion(user);
      await user.click(screen.getByRole('button', { name: /start speaking/i }));
      await screen.findByText('Listening.');
      const realFinish = recognizer.session!.finish.bind(recognizer.session);
      recognizer.session!.finish = async () => {
        finishSpy();
        return realFinish();
      };
      act(() => recognizer.say(GOOD_ANSWER));
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByRole('timer')).toHaveTextContent('0:30');
      await act(async () => {
        vi.advanceTimersByTime(31_000);
      });
      expect(await screen.findByRole('article', { name: 'Feedback' })).toBeInTheDocument();
      expect(finishSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
