import { parseRtttl } from './rtttl';

let sharedAudioCtx: AudioContext | null = null;

export function playRtttlPreview(rtttlStr: string, volumePct: number): { started: boolean; error?: string } {
  const parsed = parseRtttl(rtttlStr);
  if (!parsed.valid) {
    return { started: false, error: parsed.error || 'Invalid RTTTL melody' };
  }

  if (typeof window === 'undefined') {
    return { started: false };
  }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { started: false, error: 'Web Audio API unavailable in this browser.' };
  }

  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }

    const gainScale = Math.max(0, Math.min(1, volumePct / 100)) * 0.14;
    let cursor = sharedAudioCtx.currentTime + 0.02;

    for (const note of parsed.notes) {
      const durSec = Math.max(0.02, note.durationMs / 1000);
      if (note.freqHz > 0 && gainScale > 0) {
        const osc = sharedAudioCtx.createOscillator();
        const gain = sharedAudioCtx.createGain();
        osc.type = 'square'; // simulates piezo buzzer harmonic timbre
        osc.frequency.setValueAtTime(note.freqHz, cursor);
        gain.gain.setValueAtTime(0.0001, cursor);
        gain.gain.exponentialRampToValueAtTime(gainScale, cursor + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, cursor + durSec - 0.005);

        osc.connect(gain);
        gain.connect(sharedAudioCtx.destination);
        osc.start(cursor);
        osc.stop(cursor + durSec);
      }
      cursor += durSec;
    }

    return { started: true };
  } catch {
    return { started: false, error: 'Audio playback blocked by browser autoplay policy.' };
  }
}
