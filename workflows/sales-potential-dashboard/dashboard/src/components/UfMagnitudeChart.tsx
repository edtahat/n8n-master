import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { seqColor } from '../lib/colors';
import { numFmt } from '../lib/format';
import type { DistributionRow } from '../types';

// Forma escolhida pela skill dataviz para "comparar magnitude, baixo -> alto"
// entre muitas categorias (até 27 UFs): barra horizontal + rampa sequencial
// (um hue só, mais escuro = mais peças), no lugar do "mapa" de bolhas com
// coordenadas aproximadas do dashboard anterior — mais honesto (não finge
// ser geografia real) e mais fácil de ler/ordenar.
export function UfMagnitudeChart({ rows }: { rows: DistributionRow[] }) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.UF, (totals.get(row.UF) ?? 0) + row.Qtd_Final_UF);
  }
  const data = [...totals.entries()]
    .map(([uf, total]) => ({ uf, total }))
    .sort((a, b) => b.total - a.total);
  const max = data.reduce((m, d) => Math.max(m, d.total), 0);

  if (data.length === 0) {
    return <p className="card-sub">Sem dados para os filtros selecionados.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 22)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--gridline)" strokeDasharray="0" />
        <XAxis
          type="number"
          tickFormatter={numFmt}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--baseline)' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="uf"
          width={32}
          tick={{ fill: 'var(--text-primary)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--baseline)' }}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar dataKey="total" name="Qtd. distribuída" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((d) => (
            <Cell key={d.uf} fill={seqColor(max > 0 ? d.total / max : 0)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
