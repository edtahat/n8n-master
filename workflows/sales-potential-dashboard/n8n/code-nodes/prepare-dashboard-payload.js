// Agrega o resultado de "Calcular Distribuicao do Extra" em um único payload
// para alimentar o dashboard React via Respond to Webhook.
//
// FIX (revisão): este node antes recebia só as linhas Tipo_Registro=
// DISTRIBUICAO que sobreviviam ao node "If1" — e a saída FALSE do IF (todas
// as EXCECAO) nunca estava conectada a nada, então todo erro de distribuição
// desaparecia sem deixar rastro. O node "If1" foi removido do fluxo: agora
// este node recebe TODAS as linhas diretamente de "Calcular Distribuicao do
// Extra" (DISTRIBUICAO + DISTRIBUICAO_FILIAL + EXCECAO + RESUMO_EXECUCAO) e
// faz a separação aqui, então nada é descartado silenciosamente.
const items = $input.all();
const linhasBrutas = items.map((item) => item.json);

const linhas = linhasBrutas.filter((l) => l.Tipo_Registro === 'DISTRIBUICAO');
const linhasFilial = linhasBrutas.filter((l) => l.Tipo_Registro === 'DISTRIBUICAO_FILIAL');
const excecoes = linhasBrutas.filter((l) => l.Tipo_Registro === 'EXCECAO');
const resumoExecucao = linhasBrutas.find((l) => l.Tipo_Registro === 'RESUMO_EXECUCAO') ?? null;

function uniqueSorted(values) {
  return [
    ...new Set(
      values.map((v) => (v === null || v === undefined ? '' : String(v).trim())).filter((v) => v !== ''),
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const totaisPorUf = {};
// NOVO: mesma quebra real (com lastro de frota) vs direcionada (sem lastro,
// redistribuição igualitária do % sobrante) — pedida para o dashboard —
// agora agregada por UF e no total geral.
const totaisRealVsDirecionadoPorUf = {};
let totalRealFrota = 0;
let totalDirecionada = 0;

for (const linha of linhas) {
  if (!linha.UF) continue;
  totaisPorUf[linha.UF] = (totaisPorUf[linha.UF] || 0) + (linha.Qtd_Final_UF || 0);

  const bucket = totaisRealVsDirecionadoPorUf[linha.UF] || { real: 0, direcionada: 0 };
  bucket.real += linha.Qtd_Real_Frota_UF || 0;
  bucket.direcionada += linha.Qtd_Direcionada_UF || 0;
  totaisRealVsDirecionadoPorUf[linha.UF] = bucket;

  totalRealFrota += linha.Qtd_Real_Frota_UF || 0;
  totalDirecionada += linha.Qtd_Direcionada_UF || 0;
}

// NOVO: "peças por filial por cliente" — agrega as linhas por Cliente, para
// o painel dedicado no dashboard. Usa DISTRIBUICAO_FILIAL (dado real) quando
// existe; cai para a estimativa uniforme (Qtd_Base_Por_Filial /
// Filiais_Com_Mais_1) da própria linha UF quando não existe identificação de
// filial na planilha de origem.
const porClienteUfMap = new Map();
for (const linha of linhas) {
  const key = `${linha.Cliente}|${linha.UF}`;
  if (!porClienteUfMap.has(key)) {
    porClienteUfMap.set(key, {
      cliente: linha.Cliente,
      uf: linha.UF,
      filiaisUf: linha.Filiais_UF,
      qtdFinalUf: 0,
      qtdBasePorFilialEstimada: linha.Qtd_Base_Por_Filial,
      filiaisComMais1Estimado: linha.Filiais_Com_Mais_1,
      estimada: linha.Distribuicao_Filial_Estimada,
      filiais: [],
    });
  }
  porClienteUfMap.get(key).qtdFinalUf += linha.Qtd_Final_UF || 0;
}
for (const linha of linhasFilial) {
  const key = `${linha.Cliente}|${linha.UF}`;
  const entry = porClienteUfMap.get(key);
  if (entry) {
    entry.filiais.push({ filial: linha.Filial, qtdFinalFilial: linha.Qtd_Final_Filial });
  }
}
const distribuicaoPorFilial = [...porClienteUfMap.values()].sort(
  (a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR') || a.uf.localeCompare(b.uf, 'pt-BR'),
);

return [
  {
    json: {
      geradoEm: new Date().toISOString(),
      totalLinhas: linhas.length,
      filtros: {
        ufs: uniqueSorted(linhas.map((l) => l.UF)),
        clientes: uniqueSorted(linhas.map((l) => l.Cliente)),
        partNumbers: uniqueSorted(linhas.map((l) => l.Part_Number)),
        familias: uniqueSorted(linhas.map((l) => l.Familia)),
      },
      totaisPorUf,
      totaisRealVsDirecionadoPorUf,
      totalRealVsDirecionado: { real: totalRealFrota, direcionada: totalDirecionada },
      linhas,
      distribuicaoPorFilial,
      excecoes,
      resumoExecucao,
    },
  },
];
