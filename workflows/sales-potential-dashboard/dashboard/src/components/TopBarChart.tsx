import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { numFmt } from '../lib/format';
import type { DistributionRow } from '../types';

interface TopBarChartProps {
  rows: DistributionRow[];
  groupKey: 'Cliente' | 'Part_Number';
  limit?: number;
}

// Série única (uma identidade é o "eixo" do gráfico, não uma comparação
// entre séries) -> sem legenda, cor categórica única (slot 1), com o valor
// rotulado na ponta de cada barra (só 10 itens, então não é poluição).
export function TopBarChart({ rows, groupKey, limit = 10 }: TopBarChartProps) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row[groupKey] || '(vazio)';
    totals.set(key, (totals.get(key) ?? 0) + row.Qtd_Final_UF);
  }
  const data = [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  if (data.length === 0) {
    return <p className="card-sub">Sem dados para os filtros selecionados.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--gridline)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--baseline)' }}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar dataKey="total" name="Qtd. distribuída" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList
            dataKey="total"
            position="right"
            formatter={(v: number) => numFmt(v)}
            style={{ fill: 'var(--text-primary)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
