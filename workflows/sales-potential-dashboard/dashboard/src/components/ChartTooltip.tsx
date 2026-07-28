import { numFmt } from '../lib/format';

interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
  formatter?: (value: number) => string;
}

// Tooltip compartilhado por todos os gráficos: uma linha por série, valor em
// destaque (Strong) e o nome da série secundário — a hierarquia da legenda
// invertida, porque aqui o leitor já sabe a categoria e quer o número.
export function ChartTooltip({ active, label, payload, formatter = numFmt }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 10px',
        fontSize: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        minWidth: 140,
      }}
    >
      {label ? (
        <div style={{ color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      ) : null}
      {payload.map((entry, i) => (
        <div
          key={`${entry.dataKey ?? entry.name ?? i}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}
        >
          <span
            aria-hidden
            style={{ display: 'inline-block', width: 10, height: 2, background: entry.color, flexShrink: 0 }}
          />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatter(Number(entry.value ?? 0))}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>{entry.name}</span>
        </div>
      ))}
    </div>
  );
}
