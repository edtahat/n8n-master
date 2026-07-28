import { useMemo, useState } from 'react';
import { numFmt } from '../lib/format';
import type { ClienteUfBreakdown } from '../types';

interface BranchBreakdownPanelProps {
  data: ClienteUfBreakdown[];
  ufFilter: Set<string>;
  clienteFilter: string;
}

// NOVO painel pedido: "quantas peças por filial por cliente". Esta visão
// agrega todos os Part Numbers/Famílias de um cliente (filiais são
// compartilhadas entre produtos) — por isso só os filtros de UF e Cliente se
// aplicam aqui; Família/Part Number não. Tabela em vez de gráfico: é
// exatamente o caso "mais de ~7 classes que carregam significado" da skill
// de dataviz (identidade de filial não é magnitude/série, é um rótulo).
export function BranchBreakdownPanel({ data, ufFilter, clienteFilter }: BranchBreakdownPanelProps) {
  const filtered = useMemo(() => {
    const clienteQ = clienteFilter.trim().toLowerCase();
    return data.filter((d) => {
      if (ufFilter.size && !ufFilter.has(d.uf)) return false;
      if (clienteQ && !d.cliente.toLowerCase().includes(clienteQ)) return false;
      return true;
    });
  }, [data, ufFilter, clienteFilter]);

  const clientes = useMemo(
    () => [...new Set(filtered.map((d) => d.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [filtered],
  );

  const [selected, setSelected] = useState<string>('');
  const clienteAtual = clientes.includes(selected) ? selected : (clientes[0] ?? '');

  const linhasCliente = filtered
    .filter((d) => d.cliente === clienteAtual)
    .sort((a, b) => a.uf.localeCompare(b.uf, 'pt-BR'));

  if (clientes.length === 0) {
    return <p className="card-sub">Sem dados para os filtros selecionados.</p>;
  }

  return (
    <div>
      <label htmlFor="branch-client-select" className="branch-select-label">
        Cliente:{' '}
        <select
          id="branch-client-select"
          value={clienteAtual}
          onChange={(e) => setSelected(e.target.value)}
          className="branch-select"
        >
          {clientes.map((c) => (
            <option value={c} key={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div className="table-wrap" style={{ maxHeight: 320, marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>UF</th>
              <th className="num">Filiais</th>
              <th className="num">Qtd. final</th>
              <th>Divisão por filial</th>
            </tr>
          </thead>
          <tbody>
            {linhasCliente.map((row) => (
              <tr key={`${row.cliente}|${row.uf}`}>
                <td>{row.uf}</td>
                <td className="num">{numFmt(row.filiaisUf)}</td>
                <td className="num">{numFmt(row.qtdFinalUf)}</td>
                <td>
                  {row.estimada ? (
                    <span className="branch-estimate" title="Planilha de origem sem coluna de identificação de filial">
                      ≈ {numFmt(row.qtdBasePorFilialEstimada)}/filial
                      {row.filiaisComMais1Estimado > 0
                        ? ` (+1 em ${numFmt(row.filiaisComMais1Estimado)} filial${row.filiaisComMais1Estimado > 1 ? 'is' : ''})`
                        : ''}{' '}
                      — estimativa
                    </span>
                  ) : (
                    <span className="branch-chips">
                      {row.filiais.map((f) => (
                        <span className="branch-chip" key={f.filial}>
                          {f.filial}: {numFmt(f.qtdFinalFilial)}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
