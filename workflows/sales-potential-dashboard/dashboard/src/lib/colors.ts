// Interpolador da rampa sequencial (um hue, claro -> escuro) definida em
// theme.css / references/palette.md da skill dataviz. Usado para colorir por
// magnitude (ex.: barras de UF), nunca para identidade categórica.
const SEQ_STEPS: Array<[number, string]> = [
  [0.0, '#cde2fb'],
  [0.083, '#b7d3f6'],
  [0.166, '#9ec5f4'],
  [0.25, '#86b6ef'],
  [0.333, '#6da7ec'],
  [0.416, '#5598e7'],
  [0.5, '#3987e5'],
  [0.583, '#2a78d6'],
  [0.666, '#256abf'],
  [0.75, '#1c5cab'],
  [0.833, '#184f95'],
  [0.916, '#104281'],
  [1.0, '#0d366b'],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function seqColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < SEQ_STEPS.length - 1; i++) {
    const [aStop, aHex] = SEQ_STEPS[i];
    const [bStop, bHex] = SEQ_STEPS[i + 1];
    if (clamped >= aStop && clamped <= bStop) {
      const localT = (clamped - aStop) / (bStop - aStop || 1);
      const [ar, ag, ab] = hexToRgb(aHex);
      const [br, bg, bb] = hexToRgb(bHex);
      return rgbToHex(ar + (br - ar) * localT, ag + (bg - ag) * localT, ab + (bb - ab) * localT);
    }
  }
  return SEQ_STEPS[SEQ_STEPS.length - 1][1];
}

// Slots categóricos fixos (ordem nunca ciclada — ver palette.md).
export const SERIES = {
  real: 'var(--series-1)', // blue
  direcionada: 'var(--series-2)', // orange
} as const;

export const STATUS = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
} as const;
