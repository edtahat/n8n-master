import { numFmt } from '../lib/format';

interface Kpi {
  label: string;
  value: number;
  tone?: 'default' | 'critical';
}

export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="kpi-row">
      {items.map((item) => (
        <div className="card kpi-tile" key={item.label}>
          <div className="value" style={item.tone === 'critical' ? { color: 'var(--status-critical)' } : undefined}>
            {numFmt(item.value)}
          </div>
          <div className="label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
