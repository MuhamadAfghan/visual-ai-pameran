// Best-effort browser audio for violation alerts (chime + Indonesian TTS).
// Every export here must never throw — audio is an enhancement on top of the
// toast/visual alert, which always fires regardless of whether sound works.

const CHIME_URL = "/assets/audio/violation-chime.mp3";

/** Plays the alert chime. A fresh `Audio` instance per call (rather than one
 *  shared/reused element) so overlapping triggers — e.g. two cameras
 *  violating within the same second — layer instead of cutting each other off. */
export function playChime(): void {
  try {
    void new Audio(CHIME_URL).play();
  } catch {
    // ignore — best-effort
  }
}

// Setting utterance.lang alone is not enough to get Indonesian pronunciation —
// Chrome/Edge keep speaking with whichever voice is already selected (usually
// an English default) unless utterance.voice is set explicitly. getVoices()
// can also return [] on the very first call — the list loads asynchronously
// and fires 'voiceschanged' once ready — so we cache it once populated.
let cachedVoices: SpeechSynthesisVoice[] = [];

function refreshVoiceCache(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) cachedVoices = voices;
  return cachedVoices;
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoiceCache);
}

function findIndonesianVoice(): SpeechSynthesisVoice | null {
  const voices = cachedVoices.length ? cachedVoices : refreshVoiceCache();
  return (
    voices.find((v) => v.lang.toLowerCase() === "id-id") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("id")) ??
    null
  );
}

// Caps how many spoken utterances can be in flight at once so an alert storm
// (many cameras violating at once) doesn't talk over itself for minutes on end.
// Chime + toast still fire for every event regardless of this cap.
const MAX_QUEUED_UTTERANCES = 3;
const UTTERANCE_SAFETY_TIMEOUT_MS = 15_000;
let queuedCount = 0;

function trackUtterance(): void {
  queuedCount += 1;
  setTimeout(untrackUtterance, UTTERANCE_SAFETY_TIMEOUT_MS);
}

function untrackUtterance(): void {
  queuedCount = Math.max(0, queuedCount - 1);
}

/** Speaks `text` in Indonesian. Does not cancel prior utterances — the Web
 *  Speech API queues `.speak()` calls automatically, so back-to-back
 *  violations are announced one after another instead of cutting each other off. */
export function speakViolation(text: string): void {
  try {
    if (!("speechSynthesis" in window)) return;
    if (queuedCount >= MAX_QUEUED_UTTERANCES) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    const voice = findIndonesianVoice();
    if (voice) utterance.voice = voice;
    trackUtterance();
    utterance.onend = untrackUtterance;
    utterance.onerror = untrackUtterance;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore — best-effort
  }
}

/** Primes chime playback + speech synthesis from a real user gesture, since
 *  some browsers gate both behind one. Safe to call more than once. */
export function unlockAudio(): void {
  try {
    const primer = new Audio(CHIME_URL);
    primer.muted = true;
    primer
      .play()
      .then(() => primer.pause())
      .catch(() => {
        // ignore — best-effort
      });
  } catch {
    // ignore — best-effort
  }
  try {
    if ("speechSynthesis" in window) {
      refreshVoiceCache();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    }
  } catch {
    // ignore — best-effort
  }
}
