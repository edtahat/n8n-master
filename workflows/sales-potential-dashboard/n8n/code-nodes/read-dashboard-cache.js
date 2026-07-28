// Lê o último payload calculado pelo pipeline principal (disparado por "When
// Executed by Another Workflow"), sem reprocessar SharePoint/SQL/distribuição
// a cada chamada do webhook.
const staticData = $getWorkflowStaticData('global');

const payloadVazio = {
  erro: 'Nenhum dado calculado ainda. Execute o fluxo principal (When Executed by Another Workflow) pelo menos uma vez.',
  atualizadoEm: null,
  totalLinhas: 0,
  filtros: { ufs: [], clientes: [], partNumbers: [], familias: [] },
  totaisPorUf: {},
  totaisRealVsDirecionadoPorUf: {},
  totalRealVsDirecionado: { real: 0, direcionada: 0 },
  linhas: [],
  distribuicaoPorFilial: [],
  excecoes: [],
  resumoExecucao: null,
};

if (!staticData.dashboardPayload) {
  return [{ json: payloadVazio }];
}

return [
  {
    json: Object.assign({}, payloadVazio, staticData.dashboardPayload, {
      atualizadoEm: staticData.dashboardUpdatedAt,
      erro: null,
    }),
  },
];
