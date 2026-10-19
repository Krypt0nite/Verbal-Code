import { Modal } from './Modal';

export function PrivacyDialog({ open, onClose, onClearData }: { open: boolean; onClose(): void; onClearData(): void }) {
  return (
    <Modal open={open} title="Your privacy" onClose={onClose} footer={<button type="button" className="button primary" onClick={onClose}>Close</button>}>
      <ul className="prose-list">
        <li>VerbalCode never records audio. Your browser turns speech into text, and the text lives only in this tab's memory.</li>
        <li>Transcripts are never saved to localStorage, IndexedDB, analytics or logs. They are cleared when you cancel, discard, start a new question or close the page.</li>
        <li>
          On-device recognition is used by default when your browser offers it. VerbalCode never switches to a cloud service on its own: cloud recognition
          only runs after you agree to it, and the session shows which one is active.
        </li>
        <li>
          On-device recognition is built by your browser vendor. VerbalCode asks the browser to keep speech on this device and refuses to start if it
          can't, but it can't independently verify what the browser does internally.
        </li>
        <li>Cloud recognition means your browser sends audio to its vendor (for example Google for Chrome). VerbalCode can't control what the vendor does with it.</li>
        <li>Feedback is computed on this device by default. AI feedback is optional, asks for your consent first, and sends only your transcript plus details of the question (its text, category, difficulty, rubric and reference answer).</li>
        <li>Only your settings and the IDs of recently practised questions are stored in this browser, so topics don't repeat.</li>
      </ul>
      <button type="button" className="link-button" onClick={onClearData}>
        Clear stored settings and question history
      </button>
    </Modal>
  );
}

interface ConsentProps {
  open: boolean;
  onAccept(): void;
  onDecline(): void;
}

export function CloudConsentDialog({ open, onAccept, onDecline }: ConsentProps) {
  return (
    <Modal
      open={open}
      title="Use your browser's cloud speech service?"
      onClose={onDecline}
      footer={
        <>
          <button type="button" className="button" onClick={onDecline}>
            Keep on-device only
          </button>
          <button type="button" className="button primary" onClick={onAccept}>
            Use cloud recognition
          </button>
        </>
      }
    >
      <p>On-device recognition isn't available here. If you continue, your browser will send your microphone audio to its vendor's speech service to produce the transcript.</p>
      <p>VerbalCode does not receive or store the audio, but it cannot control how the vendor processes it. You can withdraw this choice any time in Settings.</p>
    </Modal>
  );
}

export function AiConsentDialog({ open, onAccept, onDecline, providerLabel, dataNotice }: ConsentProps & { providerLabel: string | null; dataNotice: string | null }) {
  return (
    <Modal
      open={open}
      title="Turn on AI feedback?"
      onClose={onDecline}
      footer={
        <>
          <button type="button" className="button" onClick={onDecline}>
            Keep local feedback
          </button>
          <button type="button" className="button primary" onClick={onAccept}>
            Turn on AI feedback
          </button>
        </>
      }
    >
      <p>
        After each answer, your transcript and details of the question (its text, category, difficulty, rubric, reference points and reference answer) will be sent to {providerLabel ?? 'the configured AI provider'} through this site's server. Audio is never sent.
      </p>
      {dataNotice && <p>{dataNotice}</p>}
      <p>Free AI tiers often have strict limits and may use submitted text to improve their products. Don't speak anything you wouldn't want to share.</p>
    </Modal>
  );
}
