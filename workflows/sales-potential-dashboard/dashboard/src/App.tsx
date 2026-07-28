import { useMemo, useState } from 'react';
import { KpiRow } from './components/KpiRow';
import { FilterBar } from './components/FilterBar';
import { ChartCard } from './components/ChartCard';
import { UfMagnitudeChart } from './components/UfMagnitudeChart';
import { TopBarChart } from './components/TopBarChart';
import { FleetVsDirectedChart } from './components/FleetVsDirectedChart';
import { BranchBreakdownPanel } from './components/BranchBreakdownPanel';
import { ExceptionsPanel } from './components/ExceptionsPanel';
import { DetailTable } from './components/DetailTable';
import { useFilterState, useFilteredRows } from './lib/useFilteredRows';
import { buildMockPayload } from './mockData';
import { numFmt } from './lib/format';
import type { DashboardPayload } from './types';

function loadInitialPayload(): { payload: DashboardPayload; source: 'n8n' | 'mock' } {
  if (typeof window !== 'undefined' && window.__N8N_PAYLOAD__) {
    return { payload: window.__N8N_PAYLOAD__, source: 'n8n' };
  }
  return { payload: buildMockPayload(), source: 'mock' };
}

export default function App() {
  const [{ payload, source }, setState] = useState(loadInitialPayload);
  const [filters, setFilters] = useFilterState();

  const filteredRows = useFilteredRows(payload.linhas, filters);

  const kpis = useMemo(() => {
    const clientes = new Set(filteredRows.map((r) => r.Cliente));
    const partNumbers = new Set(filteredRows.map((r) => r.Part_Number));
    const ufs = new Set(filteredRows.map((r) => r.UF));
    const total = filteredRows.reduce((acc, r) => acc + r.Qtd_Final_UF, 0);
    const real = filteredRows.reduce((acc, r) => acc + r.Qtd_Real_Frota_UF, 0);
    const direcionada = filteredRows.reduce((acc, r) => acc + r.Qtd_Direcionada_UF, 0);
    return { clientes: clientes.size, partNumbers: partNumbers.size, ufs: ufs.size, total, real, direcionada };
  }, [filteredRows]);

  const naoDistribuido = payload.excecoes.reduce((acc, e) => acc + (e.Qtd_Extra_Cliente || 0), 0);

  function useMock() {
    setState({ payload: buildMockPayload(), source: 'mock' });
  }

  const statusLabel =
    source === 'n8n'
      ? `n8n${payload.atualizadoEm ? ` (atualizado em ${new Date(payload.atualizadoEm).toLocaleString('pt-BR')})` : ''} — ${numFmt(payload.linhas.length)} linhas carregadas.`
      : 'Exibindo dados de exemplo.';

  return (
    <>
      <h1>Distribuição do Potencial Extra por UF</h1>
      <p className="subtitle">Servido diretamente pelo webhook do n8n — os dados já vêm embutidos nesta página</p>

      {payload.erro ? <div className="banner banner-error">{payload.erro}</div> : null}

      <div className="card source-bar">
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Atualizar dados
        </button>
        <button type="button" onClick={useMock}>
          Usar dados de exemplo
        </button>
        <span id="status-msg" className={source === 'n8n' ? 'ok' : ''}>
          {statusLabel}
        </span>
      </div>

      <KpiRow
        items={[
          { label: 'Qtd. total distribuída', value: kpis.total },
          { label: 'Real (com lastro de frota)', value: kpis.real },
          { label: 'Direcionada (sem lastro)', value: kpis.direcionada },
          { label: 'Clientes', value: kpis.clientes },
          { label: 'Part Numbers', value: kpis.partNumbers },
          { label: 'Não distribuído (exceções)', value: naoDistribuido, tone: 'critical' },
        ]}
      />

      <FilterBar options={payload.filtros} filters={filters} onChange={setFilters} />

      <div className="main-grid">
        <ChartCard title="Quantidade distribuída por UF" subtitle="Barras ordenadas por magnitude, cor = intensidade">
          <UfMagnitudeChart rows={filteredRows} />
        </ChartCard>
        <div className="side-charts">
          <ChartCard title="Top 10 clientes" subtitle="Por quantidade final distribuída">
            <TopBarChart rows={filteredRows} groupKey="Cliente" />
          </ChartCard>
          <ChartCard title="Top 10 Part Numbers" subtitle="Por quantidade final distribuída">
            <TopBarChart rows={filteredRows} groupKey="Part_Number" />
          </ChartCard>
        </div>
      </div>

      <ChartCard
        title="Real vs. Direcionada, por UF"
        subtitle="Real = lastro em frota conhecida do Part Number na UF. Direcionada = extra sem lastro, dividido igualmente entre as UFs do cliente."
      >
        <FleetVsDirectedChart rows={filteredRows} />
      </ChartCard>

      <ChartCard
        title="Peças por filial, por cliente"
        subtitle="Filtros de UF e Cliente se aplicam; Família/Part Number não — filiais são compartilhadas entre produtos."
      >
        <BranchBreakdownPanel data={payload.distribuicaoPorFilial} ufFilter={filters.ufs} clienteFilter={filters.cliente} />
      </ChartCard>

      <ChartCard
        title="Exceções (não distribuído)"
        subtitle="Linhas que não puderam ser distribuídas, e por quê — antes descartadas silenciosamente pelo fluxo."
      >
        <ExceptionsPanel excecoes={payload.excecoes} filters={filters} />
      </ChartCard>

      <ChartCard title="Detalhamento">
        <DetailTable rows={filteredRows} />
      </ChartCard>

      {payload.resumoExecucao ? (
        <p className="audit-strip">
          Auditoria da última execução: {numFmt(payload.resumoExecucao.linhasVendaDuplicatasExatasRemovidas)} linha(s)
          de venda duplicada(s) removida(s), {numFmt(payload.resumoExecucao.linhasVendaAgregadasPorDuplicidade)}{' '}
          linha(s) agregada(s) por duplicidade, {numFmt(payload.resumoExecucao.clientesUfDuplicatasExatasRemovidas)}{' '}
          duplicata(s) de Customer_Branch e {numFmt(payload.resumoExecucao.fleetDuplicatasExatasRemovidas)}{' '}
          duplicata(s) de frota ignoradas. Gerado em{' '}
          {new Date(payload.resumoExecucao.geradoEm).toLocaleString('pt-BR')}.
        </p>
      ) : null}
    </>
  );
}
