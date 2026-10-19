import { expect, test, type Page } from '@playwright/test';

/**
 * Installs a fake Web Speech API before the app loads. No real microphone is used.
 * `window.__speak(text)` emits a final recognition result.
 */
async function installFakeSpeech(page: Page, opts: { local: 'available' | 'none'; deny?: boolean }) {
  await page.addInitScript(({ local, deny }) => {
    type Handler = ((e?: unknown) => void) | null;
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      processLocally = false;
      onresult: Handler = null;
      onerror: Handler = null;
      onend: Handler = null;
      onstart: Handler = null;
      private texts: string[] = [];
      start() {
        (window as unknown as { __rec: FakeRecognition }).__rec = this;
        (window as unknown as { __lastProcessLocally: boolean }).__lastProcessLocally = this.processLocally;
        setTimeout(() => {
          if (deny) {
            this.onerror?.({ error: 'not-allowed' });
            this.onend?.();
          } else this.onstart?.();
        }, 20);
      }
      stop() {
        setTimeout(() => this.onend?.(), 10);
      }
      abort() {
        this.onresult = this.onerror = this.onend = this.onstart = null;
      }
      emit(text: string) {
        this.texts.push(text);
        const results = this.texts.map((t) => Object.assign([{ transcript: t }], { isFinal: true }));
        this.onresult?.({ results: Object.assign(results, { length: results.length }) });
      }
    }
    if (local === 'available') {
      Object.assign(FakeRecognition, {
        available: async () => 'available',
        install: async () => true,
      });
    }
    Object.assign(window, {
      // Replace both names: modern Chromium ships an unprefixed SpeechRecognition.
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
      __speak: (t: string) => (window as unknown as { __rec?: FakeRecognition }).__rec?.emit(t),
    });
  }, opts);
}

const ANSWER =
  'Binary search finds a target in a sorted array. First we look at the middle element. Because we halve the search space every step, ' +
  'the time complexity is O(log n). The iterative version uses constant space. However, watch for edge cases like an empty array, ' +
  'duplicates and overflow. For example, compute mid as low plus high minus low over two. In summary it is fast but needs sorted input.';

test('complete practice session with on-device recognition and local feedback', async ({ page }) => {
  await installFakeSpeech(page, { local: 'available' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('explain it out loud');
  await page.getByLabel('Subcategory').selectOption('dsa');
  await page.getByRole('button', { name: /give me a question/i }).click();
  await expect(page.getByRole('timer')).toHaveText('1:00');

  await page.getByRole('button', { name: /start speaking/i }).click();
  await expect(page.getByText('Listening.')).toBeVisible();
  await expect(page.getByText('On-device recognition')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __lastProcessLocally: boolean }).__lastProcessLocally)).toBe(true);

  await page.evaluate((t) => (window as unknown as { __speak: (t: string) => void }).__speak(t), ANSWER);
  await expect(page.locator('.live-transcript')).toContainText('Binary search finds');
  // The countdown is really running.
  await expect(page.getByRole('timer')).not.toHaveText('1:00', { timeout: 3000 });

  await page.getByRole('button', { name: 'Finish' }).click();
  const report = page.getByRole('article', { name: 'Feedback' });
  await expect(report).toBeVisible();
  await expect(report).toContainText('Local evaluator');
  await expect(report.getByRole('heading', { name: 'Rubric' })).toBeVisible();

  // Nothing about the answer is persisted.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain('Binary search finds');
  expect(page.url()).not.toContain('Binary');

  await page.getByRole('button', { name: /discard transcript/i }).click();
  await expect(report).toBeHidden();
});

test('without on-device recognition nothing starts until the user opts in to cloud', async ({ page }) => {
  await installFakeSpeech(page, { local: 'none' });
  await page.goto('/');
  await page.getByRole('button', { name: /give me a question/i }).click();
  await expect(page.getByRole('button', { name: /start speaking/i })).toBeDisabled();
  await page.getByRole('button', { name: /use cloud recognition/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^use cloud recognition$/i }).click();
  await page.getByRole('button', { name: /start speaking/i }).click();
  await expect(page.getByText('Cloud recognition (browser vendor)')).toBeVisible();
});

test('permission denial is explained', async ({ page }) => {
  await installFakeSpeech(page, { local: 'available', deny: true });
  await page.goto('/');
  await page.getByRole('button', { name: /give me a question/i }).click();
  await page.getByRole('button', { name: /start speaking/i }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was blocked');
});

test('keyboard users can operate the main controls', async ({ page }) => {
  await installFakeSpeech(page, { local: 'available' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to practice' })).toBeFocused();
  await page.getByRole('radio', { name: 'Interview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Deep research' })).toBeFocused();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('layout has no horizontal overflow', async ({ page }) => {
  await installFakeSpeech(page, { local: 'available' });
  await page.goto('/');
  await page.getByRole('button', { name: /give me a question/i }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
