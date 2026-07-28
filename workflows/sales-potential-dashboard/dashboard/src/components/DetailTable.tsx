import { useMemo, useState } from 'react';
import { numFmt, pctFmt } from '../lib/format';
import type { DistributionRow } from '../types';

interface Column {
  key: keyof DistributionRow;
  label: string;
  numeric?: boolean;
  format?: (row: DistributionRow) => string;
}

const COLUMNS: Column[] = [
  { key: 'Cliente', label: 'Cliente' },
  { key: 'Part_Number', label: 'Part Number' },
  { key: 'Familia', label: 'Família' },
  { key: 'UF', label: 'UF' },
  { key: 'Filiais_UF', label: 'Filiais UF', numeric: true },
  { key: 'Fleet_UF', label: 'Fleet UF', numeric: true },
  { key: 'Pct_Final', label: '% Final', numeric: true, format: (r) => pctFmt(r.Pct_Final) },
  { key: 'Qtd_Final_UF', label: 'Qtd Final UF', numeric: true },
  { key: 'Qtd_Real_Frota_UF', label: 'Qtd Real (frota)', numeric: true },
  { key: 'Qtd_Direcionada_UF', label: 'Qtd Direcionada', numeric: true },
];

const PAGE_SIZE = 25;

export function DetailTable({ rows }: { rows: DistributionRow[] }) {
  const [sortKey, setSortKey] = useState<keyof DistributionRow>('Qtd_Final_UF');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av ?? '');
      const bs = String(bv ?? '');
      return sortDir === 'asc' ? as.localeCompare(bs, 'pt-BR') : bs.localeCompare(as, 'pt-BR');
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function onSort(key: keyof DistributionRow) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  return (
    <div>
      <p className="card-sub">
        <span className="tabular">{numFmt(sorted.length)}</span> linhas (respeitando os filtros acima)
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.numeric ? 'num sorted-col' : 'sorted-col'}
                  onClick={() => onSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key ? <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={`${row.Cliente}|${row.Part_Number}|${row.UF}|${i}`}>
                {COLUMNS.map((col) => (
                  <td key={col.key} className={col.numeric ? 'num tabular' : undefined}>
                    {col.format ? col.format(row) : col.numeric ? numFmt(row[col.key] as number) : String(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          Página {currentPage} de {totalPages}
        </span>
        <div>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
