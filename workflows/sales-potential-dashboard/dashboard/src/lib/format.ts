export function numFmt(value: number | undefined | null): string {
  return Number(value ?? 0).toLocaleString('pt-BR');
}

export function pctFmt(value: number | undefined | null): string {
  return (Number(value ?? 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
}

export function compactFmt(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
