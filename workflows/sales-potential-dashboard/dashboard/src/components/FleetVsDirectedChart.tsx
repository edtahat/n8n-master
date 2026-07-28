import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { numFmt } from '../lib/format';
import type { DistributionRow } from '../types';

// NOVO painel pedido: quanto da quantidade final distribuída tem lastro real
// de frota ("Real") vs. quanto veio só da redistribuição igualitária do %
// sobrante, sem lastro em frota conhecida ("Direcionada"). Parte-todo com 2
// séries -> barra empilhada horizontal, cores categóricas fixas (slot 1 e 2),
// legenda sempre visível (regra: legenda obrigatória a partir de 2 séries).
export function FleetVsDirectedChart({ rows }: { rows: DistributionRow[] }) {
  const byUf = new Map<string, { real: number; direcionada: number }>();
  for (const row of rows) {
    const bucket = byUf.get(row.UF) ?? { real: 0, direcionada: 0 };
    bucket.real += row.Qtd_Real_Frota_UF;
    bucket.direcionada += row.Qtd_Direcionada_UF;
    byUf.set(row.UF, bucket);
  }
  const data = [...byUf.entries()]
    .map(([uf, v]) => ({ uf, Real: v.real, Direcionada: v.direcionada, total: v.real + v.direcionada }))
    .sort((a, b) => b.total - a.total);

  if (data.length === 0) {
    return <p className="card-sub">Sem dados para os filtros selecionados.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 24)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke="var(--gridline)" />
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
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
        />
        <Bar
          dataKey="Real"
          name="Real (com lastro de frota)"
          stackId="qtd"
          fill="var(--series-1)"
          stroke="var(--surface-1)"
          strokeWidth={2}
          maxBarSize={18}
        />
        <Bar
          dataKey="Direcionada"
          name="Direcionada (extra não encontrado na frota)"
          stackId="qtd"
          fill="var(--series-2)"
          stroke="var(--surface-1)"
          strokeWidth={2}
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
