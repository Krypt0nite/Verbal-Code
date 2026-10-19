import { useId } from 'react';
import { Modal } from './Modal';
import { LANGUAGES, type Preferences } from '../settings/preferences';
import type { SpeechCapabilities } from '../speech/types';
import type { StatusResponse } from '../ai/contract';

interface Props {
  open: boolean;
  prefs: Preferences;
  capabilities: SpeechCapabilities | null;
  aiStatus: StatusResponse | null;
  onChange(next: Preferences): void;
  onClose(): void;
  onRequestAiConsent(): void;
  onRequestCloudConsent(): void;
  onInstallLocal(): void;
  installing: boolean;
}

const minutes = (sec: number) => Math.round((sec / 60) * 100) / 100;

export function SettingsDialog(p: Props) {
  const id = useId();
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => p.onChange({ ...p.prefs, [key]: value });
  const local = p.capabilities?.local ?? 'unknown';

  return (
    <Modal open={p.open} title="Settings" onClose={p.onClose} footer={<button type="button" className="button primary" onClick={p.onClose}>Done</button>}>
      <fieldset className="settings-group">
        <legend>Timing</legend>
        <label className="field" htmlFor={`${id}-speech`}>
          <span>Speaking time (minutes)</span>
          <input
            id={`${id}-speech`}
            type="number"
            min={1}
            max={10}
            step={0.5}
            value={minutes(p.prefs.speechSec)}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value) * 60);
              if (Number.isFinite(v)) set('speechSec', Math.min(600, Math.max(60, v)));
            }}
          />
        </label>
        <label className="field" htmlFor={`${id}-prep`}>
          <span>Preparation time (minutes, 0 to skip)</span>
          <input
            id={`${id}-prep`}
            type="number"
            min={0}
            max={60}
            step={0.25}
            value={minutes(p.prefs.prepSec)}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value) * 60);
              if (Number.isFinite(v)) set('prepSec', Math.min(3600, Math.max(0, v)));
            }}
          />
        </label>
        <label className="field" htmlFor={`${id}-research`}>
          <span>Deep research preparation (minutes)</span>
          <input
            id={`${id}-research`}
            type="number"
            min={0}
            max={60}
            step={1}
            value={minutes(p.prefs.researchPrepSec)}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value) * 60);
              if (Number.isFinite(v)) set('researchPrepSec', Math.min(3600, Math.max(0, v)));
            }}
          />
        </label>
        <label className="field" htmlFor={`${id}-mock`}>
          <span>Questions per mock interview</span>
          <input
            id={`${id}-mock`}
            type="number"
            min={2}
            max={6}
            value={p.prefs.mockLength}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v)) set('mockLength', Math.min(6, Math.max(2, v)));
            }}
          />
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Speech recognition</legend>
        <label className="field" htmlFor={`${id}-lang`}>
          <span>Language and accent model</span>
          <select id={`${id}-lang`} value={p.prefs.language} onChange={(e) => set('language', e.target.value as Preferences['language'])}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="radio-row" role="radiogroup" aria-label="Where speech is transcribed">
          <label className="radio">
            <input type="radio" name={`${id}-loc`} checked={p.prefs.recognition === 'local'} onChange={() => set('recognition', 'local')} />
            <span>
              On this device only
              <small>{localStatusText(p.capabilities)}</small>
            </span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name={`${id}-loc`}
              checked={p.prefs.recognition === 'cloud'}
              disabled={!p.capabilities?.supported}
              onChange={() => (p.prefs.cloudConsent ? set('recognition', 'cloud') : p.onRequestCloudConsent())}
            />
            <span>
              Browser cloud service
              <small>Audio goes to your browser vendor. Requires your consent.</small>
            </span>
          </label>
        </div>
        {local === 'downloadable' && (
          <button type="button" className="button" onClick={p.onInstallLocal} disabled={p.installing}>
            {p.installing ? 'Downloading language pack…' : 'Download on-device language pack'}
          </button>
        )}
        {p.prefs.cloudConsent && (
          <button type="button" className="link-button" onClick={() => p.onChange({ ...p.prefs, cloudConsent: false, recognition: 'local' })}>
            Withdraw cloud recognition consent
          </button>
        )}
        <label className="check">
          <input type="checkbox" checked={p.prefs.showLiveTranscript} onChange={(e) => set('showLiveTranscript', e.target.checked)} />
          <span>Show live transcript while speaking</span>
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Feedback</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={p.prefs.aiEvaluation}
            disabled={!p.aiStatus?.configured}
            onChange={(e) => (e.target.checked ? p.onRequestAiConsent() : set('aiEvaluation', false))}
          />
          <span>
            AI feedback
            <small>
              {p.aiStatus?.configured
                ? `Sends your transcript (never audio) to ${p.aiStatus.providerLabel ?? 'the configured provider'}.`
                : 'Not configured on this deployment. Local feedback is always available.'}
            </small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={p.prefs.soundEffects} onChange={(e) => set('soundEffects', e.target.checked)} />
          <span>Sound cues at start, 10 seconds left, and end</span>
        </label>
      </fieldset>
    </Modal>
  );
}

function localStatusText(c: SpeechCapabilities | null): string {
  if (!c) return 'Checking your browser…';
  if (!c.supported) return 'This browser has no speech recognition.';
  if (!c.localApi) return 'Not offered by this browser.';
  switch (c.local) {
    case 'available':
      return 'Available for this language.';
    case 'downloadable':
      return 'Language pack can be downloaded.';
    case 'downloading':
      return 'Language pack is downloading.';
    case 'unavailable':
      return 'Not available for this language.';
    default:
      return 'Availability unknown.';
  }
}
