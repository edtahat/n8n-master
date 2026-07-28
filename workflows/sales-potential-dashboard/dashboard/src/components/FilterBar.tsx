import { MultiSelectFilter } from './MultiSelectFilter';
import type { FilterState } from '../lib/useFilteredRows';

interface FilterBarProps {
  options: { ufs: string[]; familias: string[]; clientes: string[]; partNumbers: string[] };
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

// Uma única linha, acima dos gráficos, escopando tudo abaixo dela — regra de
// interaction.md. Nenhum gráfico individual tem seu próprio filtro.
export function FilterBar({ options, filters, onChange }: FilterBarProps) {
  return (
    <div className="card filters">
      <MultiSelectFilter
        label="UF"
        options={options.ufs}
        selected={filters.ufs}
        onChange={(ufs) => onChange({ ...filters, ufs })}
      />
      <MultiSelectFilter
        label="Família"
        options={options.familias}
        selected={filters.familias}
        onChange={(familias) => onChange({ ...filters, familias })}
      />
      <div className="text-filter">
        <input
          type="text"
          list="list-clientes"
          placeholder="Filtrar por cliente..."
          value={filters.cliente}
          onChange={(e) => onChange({ ...filters, cliente: e.target.value })}
        />
        <datalist id="list-clientes">
          {options.clientes.map((c) => (
            <option value={c} key={c} />
          ))}
        </datalist>
      </div>
      <div className="text-filter">
        <input
          type="text"
          list="list-partnumbers"
          placeholder="Filtrar por part number..."
          value={filters.partNumber}
          onChange={(e) => onChange({ ...filters, partNumber: e.target.value })}
        />
        <datalist id="list-partnumbers">
          {options.partNumbers.map((p) => (
            <option value={p} key={p} />
          ))}
        </datalist>
      </div>
      <button
        type="button"
        id="clear-filters"
        onClick={() => onChange({ ufs: new Set(), familias: new Set(), cliente: '', partNumber: '' })}
      >
        Limpar filtros
      </button>
    </div>
  );
}
