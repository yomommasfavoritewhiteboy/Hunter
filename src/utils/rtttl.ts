export interface RingtonePreset {
  id: string;
  name: string;
  category: string;
  rtttl: string;
}

export interface RtttlNote {
  freqHz: number;
  durationMs: number;
  label: string;
}

export interface ParsedRtttl {
  valid: boolean;
  name: string;
  defaultDuration: number;
  defaultOctave: number;
  bpm: number;
  notes: RtttlNote[];
  totalDurationMs: number;
  error?: string;
}

export const RINGTONE_PRESETS: RingtonePreset[] = [
  {
    id: 'tactical-ping',
    name: 'Tactical Ping',
    category: 'Field Alert',
    rtttl: 'TacPing:d=16,o=6,b=160:c,e,g,c7,p,g,c7',
  },
  {
    id: 'meshtastic-chime',
    name: 'Meshtastic Chime',
    category: 'Packet Rx',
    rtttl: 'MeshRx:d=8,o=5,b=140:e,g#,b,4e6',
  },
  {
    id: 'morse-sos',
    name: 'Morse SOS',
    category: 'Emergency',
    rtttl: 'SOS:d=16,o=6,b=180:a,p,a,p,a,p,4a,p,4a,p,4a,p,a,p,a,p,a',
  },
  {
    id: 'alpine-beacon',
    name: 'Alpine Beacon',
    category: 'Telemetry',
    rtttl: 'Alpine:d=8,o=6,b=130:d,f#,a,4d7,16p,a,4d7',
  },
  {
    id: 'stealth-chirp',
    name: 'Stealth Low-Piezo',
    category: 'Discreet',
    rtttl: 'Stealth:d=32,o=7,b=150:c,p,e',
  },
];

const NOTE_SEMITONES: Record<string, number> = {
  c: 0,
  'c#': 1,
  d: 2,
  'd#': 3,
  e: 4,
  f: 5,
  'f#': 6,
  g: 7,
  'g#': 8,
  a: 9,
  'a#': 10,
  b: 11,
  h: 11,
};

export function parseRtttl(rtttlStr: string): ParsedRtttl {
  const trimmed = rtttlStr.trim();
  if (!trimmed) {
    return {
      valid: false,
      name: '',
      defaultDuration: 4,
      defaultOctave: 6,
      bpm: 120,
      notes: [],
      totalDurationMs: 0,
      error: 'RTTTL ringtone string cannot be empty.',
    };
  }

  const parts = trimmed.split(':');
  if (parts.length !== 3) {
    return {
      valid: false,
      name: '',
      defaultDuration: 4,
      defaultOctave: 6,
      bpm: 120,
      notes: [],
      totalDurationMs: 0,
      error: 'RTTTL format requires 3 colon-separated sections: Name:Defaults:Notes.',
    };
  }

  const name = parts[0].trim() || 'CustomTone';
  const defaultsSection = parts[1].trim().toLowerCase();
  const notesSection = parts[2].trim().toLowerCase();

  let defaultDuration = 4;
  let defaultOctave = 6;
  let bpm = 120;

  if (defaultsSection) {
    for (const token of defaultsSection.split(',')) {
      const [key, valStr] = token.trim().split('=');
      const val = Number(valStr);
      if (key === 'd' && Number.isFinite(val) && val > 0 && val <= 64) {
        defaultDuration = val;
      } else if (key === 'o' && Number.isFinite(val) && val >= 4 && val <= 8) {
        defaultOctave = val;
      } else if (key === 'b' && Number.isFinite(val) && val >= 25 && val <= 900) {
        bpm = val;
      } else if (token.trim()) {
        return {
          valid: false,
          name,
          defaultDuration,
          defaultOctave,
          bpm,
          notes: [],
          totalDurationMs: 0,
          error: `Invalid defaults token "${token.trim()}". Use d=duration,o=octave,b=bpm.`,
        };
      }
    }
  }

  if (!notesSection) {
    return {
      valid: false,
      name,
      defaultDuration,
      defaultOctave,
      bpm,
      notes: [],
      totalDurationMs: 0,
      error: 'At least one RTTTL note or rest (e.g. 8c6, 4p) is required.',
    };
  }

  const wholeNoteMs = (60 * 1000 * 4) / bpm;
  const noteTokens = notesSection.split(',').map((s) => s.trim()).filter(Boolean);
  const notes: RtttlNote[] = [];
  let totalDurationMs = 0;

  const noteRegex = /^(\d+)?([a-hp]#?)(\.)?([4-8])?$/;

  for (const token of noteTokens) {
    const match = token.match(noteRegex);
    if (!match) {
      return {
        valid: false,
        name,
        defaultDuration,
        defaultOctave,
        bpm,
        notes: [],
        totalDurationMs: 0,
        error: `Unrecognized RTTTL note "${token}".`,
      };
    }

    const durVal = match[1] ? Number(match[1]) : defaultDuration;
    if (![1, 2, 4, 8, 16, 32, 64].includes(durVal)) {
      return {
        valid: false,
        name,
        defaultDuration,
        defaultOctave,
        bpm,
        notes: [],
        totalDurationMs: 0,
        error: `Unsupported duration "${durVal}" in note "${token}".`,
      };
    }

    const pitch = match[2];
    const dotted = Boolean(match[3]);
    const octave = match[4] ? Number(match[4]) : defaultOctave;

    let durationMs = wholeNoteMs / durVal;
    if (dotted) {
      durationMs *= 1.5;
    }
    durationMs = Math.round(durationMs);

    if (pitch === 'p') {
      notes.push({ freqHz: 0, durationMs, label: 'REST' });
    } else {
      const semitone = NOTE_SEMITONES[pitch];
      if (semitone === undefined) {
        return {
          valid: false,
          name,
          defaultDuration,
          defaultOctave,
          bpm,
          notes: [],
          totalDurationMs: 0,
          error: `Unsupported pitch "${pitch}".`,
        };
      }
      // MIDI note number: C4 = 60, A4 = 69 (440 Hz)
      const midi = (octave + 1) * 12 + semitone;
      const freqHz = Math.round(440 * Math.pow(2, (midi - 69) / 12));
      notes.push({ freqHz, durationMs, label: `${pitch.toUpperCase()}${octave}` });
    }

    totalDurationMs += durationMs;
  }

  return {
    valid: true,
    name,
    defaultDuration,
    defaultOctave,
    bpm,
    notes,
    totalDurationMs,
  };
}

export function compileRtttlToCpp(rtttlStr: string): string {
  const parsed = parseRtttl(rtttlStr);
  if (!parsed.valid || parsed.notes.length === 0) {
    return '  { 880, 120 }, { 0, 40 }, { 1318, 180 }';
  }
  return parsed.notes
    .map((n) => `  { ${n.freqHz}, ${n.durationMs} } /* ${n.label} */`)
    .join(',\n');
}
