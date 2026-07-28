import type { ClienteUfBreakdown, DashboardPayload, DistributionRow, ExceptionRow } from './types';

const CLIENTES = ['Distribuidora Alfa', 'Comercial Beta', 'Auto Peças Gama', 'Rede Delta', 'Peças Epsilon'];
const PART_NUMBERS = ['1234567890', '2233445566', '3344556677', '4455667788', '5566778899'];
const FAMILIAS = ['Freios', 'Suspensão', 'Filtros', 'Motor'];
const UF_LIST = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function makeRng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function buildMockPayload(): DashboardPayload {
  const rand = makeRng(42);
  const linhas: DistributionRow[] = [];
  // Cliente+UF -> quantidade final acumulada através de todos os Part
  // Numbers. Igual ao node "Prepare Dashboard Payload" no n8n: a divisão por
  // filial usa esse total agregado, não a quantidade de um produto isolado
  // (filiais são compartilhadas entre produtos, não recriadas por produto).
  const totalPorClienteUf = new Map<string, number>();
  // Filiais_UF é uma propriedade do cadastro Customer_Branch (cliente+UF),
  // não do produto — por isso é sorteada uma única vez por cliente+UF, fora
  // do loop de Part Numbers, e reutilizada.
  const filiaisUfPorClienteUf = new Map<string, number>();
  let salesRow = 2;

  CLIENTES.forEach((cliente, clienteIdx) => {
    const shuffledUfs = [...UF_LIST].sort(() => rand() - 0.5);
    const clientUfs = shuffledUfs.slice(0, 4 + Math.floor(rand() * 6));
    const usaFilialReal = clienteIdx % 2 === 0;

    for (const uf of clientUfs) {
      filiaisUfPorClienteUf.set(`${cliente}|${uf}`, 1 + Math.floor(rand() * 4));
    }

    PART_NUMBERS.forEach((partNumber, pnIdx) => {
      const familia = FAMILIAS[pnIdx % FAMILIAS.length];
      const extra = 20 + Math.floor(rand() * 300);
      const origemRow = salesRow++;

      clientUfs.forEach((uf) => {
        const qtdFinal = 1 + Math.floor(rand() * (extra / clientUfs.length + 5));
        const pctReal = 0.1 + rand() * 0.6;
        const qtdReal = Math.min(qtdFinal, Math.round(qtdFinal * pctReal));
        const qtdDirecionada = qtdFinal - qtdReal;
        const filiaisUf = filiaisUfPorClienteUf.get(`${cliente}|${uf}`)!;
        const basePerBranch = Math.floor(qtdFinal / filiaisUf);
        const branchesWithOneMore = qtdFinal % filiaisUf;

        linhas.push({
          Tipo_Registro: 'DISTRIBUICAO',
          Sales_Rows_Origem: String(origemRow),
          Linhas_Fonte: 1,
          Cliente: cliente,
          Part_Number: partNumber,
          Familia: familia,
          Qtd_Extra_Cliente: extra,
          UF: uf,
          Filiais_UF: filiaisUf,
          Total_Filiais_Cliente: clientUfs.length,
          Fleet_UF: Math.floor(rand() * 5000),
          Fleet_UFs_Cliente: Math.floor(rand() * 20000),
          Fleet_Nacional: Math.floor(rand() * 100000) + 20000,
          Pct_Real_Fleet: pctReal * 0.7,
          Pct_Sobrante_Nacional: 1 - pctReal * 0.7,
          Pct_Redistribuida_Igual: (1 - pctReal * 0.7) / clientUfs.length,
          Pct_Final: qtdFinal / extra,
          Cota_Exata_UF: qtdFinal,
          Qtd_Base_UF: qtdFinal,
          Resto_Decimal: 0,
          Ordem_Maior_Resto: 1,
          Bonus_Resto: 0,
          Qtd_Final_UF: qtdFinal,
          Qtd_Real_Frota_UF: qtdReal,
          Qtd_Direcionada_UF: qtdDirecionada,
          Qtd_Base_Por_Filial: basePerBranch,
          Filiais_Com_Mais_1: branchesWithOneMore,
          Distribuicao_Filial_Estimada: !usaFilialReal,
          Status: 'DISTRIBUÍDO',
        });

        const key = `${cliente}|${uf}`;
        totalPorClienteUf.set(key, (totalPorClienteUf.get(key) ?? 0) + qtdFinal);
      });
    });
  });

  // Uma única divisão por filial, feita sobre o total já agregado por
  // Cliente+UF — evita exatamente o bug corrigido no node n8n: dividir por
  // filial produto-a-produto e depois somar as partes não bate com o total.
  const distribuicaoPorFilial: ClienteUfBreakdown[] = [...totalPorClienteUf.entries()].map(([key, qtdFinalUf]) => {
    const [cliente, uf] = key.split('|');
    const filiaisUf = filiaisUfPorClienteUf.get(key)!;
    const clienteIdx = CLIENTES.indexOf(cliente);
    const usaFilialReal = clienteIdx % 2 === 0;
    const basePerBranch = Math.floor(qtdFinalUf / filiaisUf);
    const branchesWithOneMore = qtdFinalUf % filiaisUf;

    return {
      cliente,
      uf,
      filiaisUf,
      qtdFinalUf,
      qtdBasePorFilialEstimada: basePerBranch,
      filiaisComMais1Estimado: branchesWithOneMore,
      estimada: !usaFilialReal,
      filiais: usaFilialReal
        ? Array.from({ length: filiaisUf }, (_, i) => ({
            filial: `${uf}-${String(i + 1).padStart(3, '0')}`,
            qtdFinalFilial: basePerBranch + (i < branchesWithOneMore ? 1 : 0),
          }))
        : [],
    };
  });

  const excecoes: ExceptionRow[] = [
    {
      Tipo_Registro: 'EXCECAO',
      Sales_Rows_Origem: '37',
      Linhas_Fonte: 1,
      Cliente: 'Comercial Nova Era',
      Part_Number: '9988776655',
      Familia: 'Motor',
      Qtd_Extra_Cliente: 42,
      Motivo: 'Cliente sem cadastro de filiais por UF',
      Fleet_Nacional: 0,
      Fleet_UFs_Cliente: 0,
      Qtd_UFs_Cliente: 0,
      Status: 'NÃO DISTRIBUÍDO',
    },
    {
      Tipo_Registro: 'EXCECAO',
      Sales_Rows_Origem: '52',
      Linhas_Fonte: 1,
      Cliente: 'Distribuidora Alfa',
      Part_Number: '0001112223',
      Familia: 'Filtros',
      Qtd_Extra_Cliente: 15,
      Motivo: 'Part Number sem frota nacional',
      Fleet_Nacional: 0,
      Fleet_UFs_Cliente: 0,
      Qtd_UFs_Cliente: 6,
      Status: 'NÃO DISTRIBUÍDO',
    },
    {
      Tipo_Registro: 'EXCECAO',
      Sales_Rows_Origem: '68',
      Linhas_Fonte: 1,
      Cliente: 'Rede Delta',
      Part_Number: '4455667788',
      Familia: 'Suspensão',
      Qtd_Extra_Cliente: 8,
      Motivo: 'Sem frota nas UFs onde o cliente possui filial',
      Fleet_Nacional: 12000,
      Fleet_UFs_Cliente: 0,
      Qtd_UFs_Cliente: 3,
      Status: 'NÃO DISTRIBUÍDO',
    },
  ];

  const totaisPorUf: Record<string, number> = {};
  const totaisRealVsDirecionadoPorUf: Record<string, { real: number; direcionada: number }> = {};
  let totalRealFrota = 0;
  let totalDirecionada = 0;

  for (const linha of linhas) {
    totaisPorUf[linha.UF] = (totaisPorUf[linha.UF] || 0) + linha.Qtd_Final_UF;
    const bucket = totaisRealVsDirecionadoPorUf[linha.UF] || { real: 0, direcionada: 0 };
    bucket.real += linha.Qtd_Real_Frota_UF;
    bucket.direcionada += linha.Qtd_Direcionada_UF;
    totaisRealVsDirecionadoPorUf[linha.UF] = bucket;
    totalRealFrota += linha.Qtd_Real_Frota_UF;
    totalDirecionada += linha.Qtd_Direcionada_UF;
  }

  return {
    erro: null,
    atualizadoEm: new Date().toISOString(),
    totalLinhas: linhas.length,
    filtros: {
      ufs: [...new Set(linhas.map((l) => l.UF))].sort(),
      clientes: [...CLIENTES].sort(),
      partNumbers: [...PART_NUMBERS].sort(),
      familias: [...FAMILIAS].sort(),
    },
    totaisPorUf,
    totaisRealVsDirecionadoPorUf,
    totalRealVsDirecionado: { real: totalRealFrota, direcionada: totalDirecionada },
    linhas,
    distribuicaoPorFilial,
    excecoes,
    resumoExecucao: {
      Tipo_Registro: 'RESUMO_EXECUCAO',
      linhasVendaRecebidas: linhas.length + 12,
      linhasVendaIgnoradasNaoPositivas: 4,
      linhasVendaUsandoAliasAmbiguoS: 0,
      gruposClientePartNumber: CLIENTES.length * PART_NUMBERS.length,
      linhasVendaDuplicatasExatasRemovidas: 3,
      linhasVendaAgregadasPorDuplicidade: 2,
      clientesUfRecebidos: linhas.length + 6,
      clientesUfDuplicatasExatasRemovidas: 6,
      linhasComIdentificacaoFilial: distribuicaoPorFilial.filter((d) => !d.estimada).length,
      linhasFleetRecebidas: 340,
      fleetDuplicatasExatasRemovidas: 5,
      registrosPositivos: CLIENTES.length * PART_NUMBERS.length + excecoes.length,
      quantidadePositiva: totalRealFrota + totalDirecionada + 65,
      registrosDistribuidos: CLIENTES.length * PART_NUMBERS.length,
      quantidadeDistribuida: totalRealFrota + totalDirecionada,
      registrosExcecao: excecoes.length,
      quantidadeNaoDistribuida: 65,
      linhasDistribuicaoUf: linhas.length,
      linhasDistribuicaoFilial: distribuicaoPorFilial.reduce((acc, d) => acc + d.filiais.length, 0),
      geradoEm: new Date().toISOString(),
    },
  };
}
