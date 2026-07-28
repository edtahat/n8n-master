import { useMemo, useState } from 'react';
import type { DistributionRow } from '../types';

export interface FilterState {
  ufs: Set<string>;
  familias: Set<string>;
  cliente: string;
  partNumber: string;
}

export function emptyFilterState(): FilterState {
  return { ufs: new Set(), familias: new Set(), cliente: '', partNumber: '' };
}

export function useFilterState() {
  return useState<FilterState>(emptyFilterState());
}

export function useFilteredRows(linhas: DistributionRow[], filters: FilterState): DistributionRow[] {
  return useMemo(() => {
    const clienteQ = filters.cliente.trim().toLowerCase();
    const pnQ = filters.partNumber.trim().toLowerCase();

    return linhas.filter((row) => {
      if (filters.ufs.size && !filters.ufs.has(row.UF)) return false;
      if (filters.familias.size && !filters.familias.has(row.Familia)) return false;
      if (clienteQ && !row.Cliente.toLowerCase().includes(clienteQ)) return false;
      if (pnQ && !row.Part_Number.toLowerCase().includes(pnQ)) return false;
      return true;
    });
  }, [linhas, filters]);
}
