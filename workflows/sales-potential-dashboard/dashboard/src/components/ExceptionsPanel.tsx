import { useMemo } from 'react';
import { numFmt } from '../lib/format';
import { STATUS } from '../lib/colors';
import type { ExceptionRow } from '../types';
import type { FilterState } from '../lib/useFilteredRows';

interface ExceptionsPanelProps {
  excecoes: ExceptionRow[];
  filters: FilterState;
}

const MOTIVO_TONE: Record<string, string> = {
  'Cliente vazio': STATUS.critical,
  'Part Number vazio': STATUS.critical,
  'Cliente sem cadastro de filiais por UF': STATUS.warning,
  'Part Number sem frota nacional': STATUS.warning,
  'Sem frota nas UFs onde o cliente possui filial': STATUS.serious,
};

function toneFor(motivo: string): string {
  for (const [prefix, tone] of Object.entries(MOTIVO_TONE)) {
    if (motivo.startsWith(prefix)) return tone;
  }
  return STATUS.serious;
}

// NOVO painel pedido implicitamente por "verifique onde estão os erros": até
// esta revisão, toda linha Tipo_Registro=EXCECAO era descartada pelo node
// "If1" (só a saída TRUE estava conectada) e nunca chegava ao dashboard.
// Agora chega, e fica visível aqui — com o motivo e quanto ficou de fora.
export function ExceptionsPanel({ excecoes, filters }: ExceptionsPanelProps) {
  const filtered = useMemo(() => {
    const clienteQ = filters.cliente.trim().toLowerCase();
    const pnQ = filters.partNumber.trim().toLowerCase();
    return excecoes.filter((e) => {
      if (filters.familias.size && !filters.familias.has(e.Familia)) return false;
      if (clienteQ && !e.Cliente.toLowerCase().includes(clienteQ)) return false;
      if (pnQ && !e.Part_Number.toLowerCase().includes(pnQ)) return false;
      return true;
    });
  }, [excecoes, filters]);

  const totalNaoDistribuido = filtered.reduce((acc, e) => acc + (e.Qtd_Extra_Cliente || 0), 0);

  if (filtered.length === 0) {
    return <p className="card-sub">Nenhuma exceção para os filtros selecionados.</p>;
  }

  return (
    <div>
      <p className="card-sub">
        <strong style={{ color: 'var(--status-critical)' }}>{numFmt(filtered.length)}</strong> exceções —{' '}
        <strong style={{ color: 'var(--status-critical)' }}>{numFmt(totalNaoDistribuido)}</strong> peças não
        distribuídas
      </p>
      <div className="table-wrap" style={{ maxHeight: 320 }}>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Part Number</th>
              <th>Família</th>
              <th className="num">Qtd. extra</th>
              <th>Motivo</th>
              <th>Linhas de origem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={`${e.Cliente}|${e.Part_Number}|${i}`}>
                <td>{e.Cliente}</td>
                <td>{e.Part_Number}</td>
                <td>{e.Familia}</td>
                <td className="num">{numFmt(e.Qtd_Extra_Cliente)}</td>
                <td>
                  <span className="badge" style={{ background: toneFor(e.Motivo) }}>
                    {e.Motivo}
                  </span>
                </td>
                <td className="tabular">{e.Sales_Rows_Origem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
