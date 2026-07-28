/*
* DISTRIBUIÇÃO DO POTENCIAL EXTRA (por UF e, quando possível, por filial)
*
* Regra de negócio (inalterada nesta revisão):
* 1. Processa somente quantidades positivas.
* 2. % real = Fleet UF / Fleet nacional.
* 3. % sobrante = 100% - soma do % real nas UFs do cliente.
* 4. % sobrante é dividida igualmente entre as UFs do cliente ("direcionada",
*    isto é: a parte do extra que NÃO tem lastro em frota real).
* 5. Converte para inteiros pelo método dos maiores restos.
* 6. Casos sem cadastro ou frota válida são marcados como exceção.
* 7. Família do produto é lida do PBI_Sales_Potential e propagada.
*
* O que mudou nesta revisão (ver README.md da pasta sales-potential-dashboard
* para a lista completa de bugs encontrados):
*
*  - BUG CRÍTICO (corrigido fora deste node): o node "If1" descartava
*    silenciosamente todas as linhas Tipo_Registro=EXCECAO, porque só a saída
*    TRUE do IF estava conectada. Esse node foi removido do fluxo; agora TODAS
*    as linhas (DISTRIBUICAO + EXCECAO + RESUMO_EXECUCAO) seguem direto para
*    "Prepare Dashboard Payload", que faz a separação internamente.
*  - BUG (corrigido aqui): linhas duplicadas de venda (mesmo Cliente + mesmo
*    Part Number aparecendo mais de uma vez em PBI_Sales_Potential) eram
*    processadas uma vez por linha, multiplicando a quantidade extra
*    distribuída. Agora as linhas são agrupadas por Cliente+Part Number antes
*    de distribuir: duplicatas EXATAS (mesmo valor) são descartadas com
*    contagem; duplicatas com valores DIFERENTES são somadas com contagem
*    (auditável via RESUMO_EXECUCAO e via Sales_Rows_Origem em cada linha).
*  - BUG (corrigido aqui): linhas de Customer_Branch e de Fleet_percent
*    exatamente repetidas (mesmo cliente+UF ou mesmo material+UF, mesmos
*    valores) eram somadas sem checagem, inflando filiais/frota. Agora
*    duplicatas exatas são detectadas e ignoradas (contadas no resumo).
*  - BUG (corrigido aqui): a checagem `Number.isInteger(extraQuantity)`
*    rejeitava valores como 45.000000001 (ruído de ponto flutuante comum em
*    exports do Excel/Power BI), jogando linhas válidas para exceção. Agora
*    usa arredondamento tolerante (roundNearInteger).
*  - NOVO (pedido do usuário): cada linha de distribuição agora expõe
*    Qtd_Real_Frota_UF (parte com lastro real de frota) e Qtd_Direcionada_UF
*    (parte "direcionada", sem lastro — a divisão igualitária do % sobrante).
*    A soma das duas sempre bate exatamente com Qtd_Final_UF.
*  - NOVO (pedido do usuário): quando a planilha Customer_Branch tiver uma
*    coluna de identificação de filial (ver BRANCH_ID_ALIASES), a divisão é
*    feita por filial real (linhas Tipo_Registro=DISTRIBUICAO_FILIAL). Sem
*    essa coluna, mantém a estimativa uniforme anterior
*    (Qtd_Base_Por_Filial/Filiais_Com_Mais_1), agora marcada explicitamente
*    com Distribuicao_Filial_Estimada=true para não ser lida como exata.
*
* Configuração do Code node:
* Mode: Run Once for All Items
*/

const CONFIG = {
  salesNode: 'PBI_Sales_Potential',
  clientUfNode: 'Customer_Branch',
  fleetNode: 'Fleet_percent',
};

// Mantenha em sincronia com PART_NUMBER_ALIASES em "Montar Lista de Materiais".
const PART_NUMBER_ALIASES = [
  '10dígitos',
  '10 dígitos',
  '10 digitos',
  '10digitos',
  'Part Number',
  'Part_Number',
  'Material',
];

const BRANCH_ID_ALIASES = [
  'Filial',
  'Codigo_Filial',
  'Codigo Filial',
  'Cod_Filial',
  'Id_Filial',
  'Nome_Filial',
  'Branch',
  'Branch_Id',
  'Branch_Name',
];

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

// Construído via String.fromCharCode (em vez do literal ̀-ͯ) só
// para evitar problemas de encoding ao editar este arquivo em ferramentas
// que normalizam unicode; o range é idêntico (marcas diacríticas combinantes).
const DIACRITICS_REGEX = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
);

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizePartNumber(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined || value === '') {
    return 0;
  }

  let text = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/%/g, '');

  // Formato brasileiro: 1.234,56
  if (text.includes('.') && text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    // Exemplo: 1.319.993
    text = text.replace(/\./g, '');
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

// Substitui o antigo `Number.isInteger(extraQuantity)`. Excel/Power BI
// frequentemente produzem ruído de ponto flutuante (45.000000001,
// 44.999999998) para valores que são conceitualmente inteiros; a checagem
// estrita anterior rejeitava esses casos válidos. Retorna null (= exceção)
// só quando o valor está genuinamente longe de um inteiro.
function roundNearInteger(value, tolerance = 1e-6) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) <= tolerance ? rounded : null;
}

function prepareRecord(json) {
  const record = {};

  for (const [key, value] of Object.entries(json ?? {})) {
    record[normalizeHeader(key)] = value;
  }

  return record;
}

function getField(record, aliases, defaultValue = '') {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);

    if (
      Object.prototype.hasOwnProperty.call(record, key) &&
      record[key] !== null &&
      record[key] !== undefined &&
      record[key] !== ''
    ) {
      return record[key];
    }
  }

  return defaultValue;
}

// ============================================================
// LEITURA DOS TRÊS NÓS
// ============================================================

const salesItems = $(CONFIG.salesNode).all();
const clientUfItems = $(CONFIG.clientUfNode).all();
const fleetItems = $(CONFIG.fleetNode).all();

const sales = salesItems.map((item) => prepareRecord(item.json));
const clientUf = clientUfItems.map((item) => prepareRecord(item.json));
const fleet = fleetItems.map((item) => prepareRecord(item.json));

// ============================================================
// MAPA: CLIENTE → UFs (branches, totalBranches, ids de filial se existirem)
// ============================================================

const clientMap = new Map();
const clientUfSignatures = new Set();
let duplicatasExatasClienteUf = 0;
let linhasComIdentificacaoFilial = 0;

for (const row of clientUf) {
  const client = normalizeText(getField(row, ['cliente', 'CLIENTE']));
  const uf = normalizeText(getField(row, ['UF']));
  const branchIdRaw = String(getField(row, BRANCH_ID_ALIASES, '')).trim();
  const branches = toNumber(getField(row, ['filiais', 'FILIAIS']));
  const totalBranches = toNumber(getField(row, ['total_filiais_cliente', 'TOTAL FILIAIS CLIENTE']));

  if (!client || !uf || branches <= 0) {
    continue;
  }

  // Duplicata exata: mesma assinatura já vista. Quando existe id de filial,
  // a assinatura inclui o id (então só é duplicata se o MESMO id repetir).
  // Quando não existe id, a assinatura é o conteúdo inteiro da linha — esta
  // planilha é pré-agregada por Cliente+UF, então uma repetição idêntica só
  // pode ser um artefato de exportação, nunca um segundo lote legítimo.
  const signature = `${client}|${uf}|${branchIdRaw}|${branches}|${totalBranches}`;
  if (clientUfSignatures.has(signature)) {
    duplicatasExatasClienteUf++;
    continue;
  }
  clientUfSignatures.add(signature);

  if (branchIdRaw) linhasComIdentificacaoFilial++;

  if (!clientMap.has(client)) {
    clientMap.set(client, new Map());
  }

  const ufMap = clientMap.get(client);

  const current = ufMap.get(uf) ?? {
    uf,
    branches: 0,
    totalBranches: 0,
    branchIds: [],
  };

  current.branches += branches;
  current.totalBranches = Math.max(current.totalBranches, totalBranches);
  if (branchIdRaw && !current.branchIds.includes(branchIdRaw)) {
    current.branchIds.push(branchIdRaw);
  }

  ufMap.set(uf, current);
}

// ============================================================
// MAPAS DE FROTA (com dedupe de linhas exatamente repetidas)
// ============================================================

const nationalFleetMap = new Map();
const fleetByPartUf = new Map();
const fleetSignatures = new Set();
let duplicatasExatasFrota = 0;

for (const row of fleet) {
  const partNumber = normalizePartNumber(getField(row, PART_NUMBER_ALIASES));
  const uf = normalizeText(getField(row, ['UF']));
  const fleetQuantity = toNumber(getField(row, ['FROTA', 'Fleet']));

  if (!partNumber || !uf) {
    continue;
  }

  // A view já deveria trazer 1 linha por Material+UF; uma repetição exata
  // (mesmo material, mesma UF, mesma frota) é um artefato de join, não uma
  // segunda frota legítima.
  const signature = `${partNumber}|${uf}|${fleetQuantity}`;
  if (fleetSignatures.has(signature)) {
    duplicatasExatasFrota++;
    continue;
  }
  fleetSignatures.add(signature);

  nationalFleetMap.set(partNumber, (nationalFleetMap.get(partNumber) ?? 0) + fleetQuantity);

  const key = `${partNumber}|${uf}`;
  fleetByPartUf.set(key, (fleetByPartUf.get(key) ?? 0) + fleetQuantity);
}

// ============================================================
// AGRUPAMENTO DAS LINHAS DE VENDA (Cliente + Part Number)
//
// FIX: antes cada linha de PBI_Sales_Potential era distribuída
// independentemente. Se a planilha tivesse duas linhas para o mesmo
// Cliente+Part Number (comum em exports do Power BI), o extra era
// distribuído em dobro. Agora agrupamos primeiro.
// ============================================================

const salesGroups = new Map();
let linhasVendaIgnoradasNaoPositivas = 0;
let linhasUsandoAliasAmbiguoS = 0;

for (let index = 0; index < sales.length; index++) {
  const row = sales[index];
  const salesRow = index + 2; // cabeçalho do Excel ocupa a linha 1

  const clienteOriginal = String(getField(row, ['CLIENTE', 'Cliente'])).trim();
  const clientKey = normalizeText(clienteOriginal);
  const partNumber = normalizePartNumber(getField(row, PART_NUMBER_ALIASES));

  const familia = String(
    getField(row, [
      'Família',
      'FAMILIA',
      'Familia',
      'Family',
      'Familia Produto',
      'Familia do Produto',
      'Product Family',
    ]),
  ).trim();

  // 'S' é um alias herdado (provável nome de coluna truncado numa versão
  // antiga da planilha). Mantido por compatibilidade, mas cada uso é
  // contado no resumo para que fique visível se está pegando a coluna certa.
  const quantityAliases = [
    'POTENCIAL QTD EXTRA CLIENTE',
    'POTENCIAL_QTD_EXTRA_CLIENTE',
    'Qtd Extra Cliente',
  ];
  let extraQuantityRaw = getField(row, quantityAliases, undefined);
  if (extraQuantityRaw === undefined) {
    const fallback = getField(row, ['S'], undefined);
    if (fallback !== undefined) {
      linhasUsandoAliasAmbiguoS++;
      extraQuantityRaw = fallback;
    }
  }

  const extraQuantity = toNumber(extraQuantityRaw);

  // Regra 1: somente valores positivos (aplicada por linha, antes de agrupar).
  if (extraQuantity <= 0) {
    linhasVendaIgnoradasNaoPositivas++;
    continue;
  }

  const groupKey = `${clientKey}|${partNumber}`;
  const group = salesGroups.get(groupKey) ?? {
    clienteOriginal: clienteOriginal || '(vazio)',
    clientKey,
    partNumber,
    familia,
    sourceRows: [],
  };
  if (!group.familia && familia) group.familia = familia;
  group.sourceRows.push({ salesRow, extraQuantity, familia });
  salesGroups.set(groupKey, group);
}

let linhasVendaDuplicatasExatas = 0;
let linhasVendaAgregadas = 0;

const salesToProcess = [];
for (const group of salesGroups.values()) {
  if (group.sourceRows.length === 1) {
    salesToProcess.push({
      clienteOriginal: group.clienteOriginal,
      clientKey: group.clientKey,
      partNumber: group.partNumber,
      familia: group.familia,
      extraQuantity: group.sourceRows[0].extraQuantity,
      salesRowsOrigem: [group.sourceRows[0].salesRow],
      linhasFonte: 1,
    });
    continue;
  }

  const valores = new Set(group.sourceRows.map((r) => r.extraQuantity));
  const isExactDuplicate = valores.size === 1;

  if (isExactDuplicate) {
    linhasVendaDuplicatasExatas += group.sourceRows.length - 1;
    salesToProcess.push({
      clienteOriginal: group.clienteOriginal,
      clientKey: group.clientKey,
      partNumber: group.partNumber,
      familia: group.familia,
      extraQuantity: group.sourceRows[0].extraQuantity,
      salesRowsOrigem: group.sourceRows.map((r) => r.salesRow),
      linhasFonte: group.sourceRows.length,
    });
  } else {
    linhasVendaAgregadas += group.sourceRows.length;
    const somaExtra = group.sourceRows.reduce((acc, r) => acc + r.extraQuantity, 0);
    salesToProcess.push({
      clienteOriginal: group.clienteOriginal,
      clientKey: group.clientKey,
      partNumber: group.partNumber,
      familia: group.familia,
      extraQuantity: somaExtra,
      salesRowsOrigem: group.sourceRows.map((r) => r.salesRow),
      linhasFonte: group.sourceRows.length,
    });
  }
}

// ============================================================
// PROCESSAMENTO / DISTRIBUIÇÃO
// ============================================================

const distribution = [];
const distributionFilial = [];
const exceptions = [];

let positiveRecords = 0;
let positiveQuantity = 0;
let distributedRecords = 0;
let distributedQuantity = 0;

for (const item of salesToProcess) {
  const { clienteOriginal, clientKey, partNumber, familia, extraQuantity, salesRowsOrigem, linhasFonte } = item;

  positiveRecords++;
  positiveQuantity += extraQuantity;

  function addException(reason, additional = {}) {
    exceptions.push({
      json: {
        Tipo_Registro: 'EXCECAO',
        Sales_Rows_Origem: salesRowsOrigem.join(','),
        Linhas_Fonte: linhasFonte,
        Cliente: clienteOriginal,
        Part_Number: partNumber,
        Familia: familia,
        Qtd_Extra_Cliente: extraQuantity,
        Motivo: reason,
        Fleet_Nacional: additional.nationalFleet ?? 0,
        Fleet_UFs_Cliente: additional.clientFleet ?? 0,
        Qtd_UFs_Cliente: additional.ufCount ?? 0,
        Status: 'NÃO DISTRIBUÍDO',
      },
    });
  }

  if (!clientKey) {
    addException('Cliente vazio');
    continue;
  }

  if (!partNumber) {
    addException('Part Number vazio');
    continue;
  }

  const extraQuantityInt = roundNearInteger(extraQuantity);
  if (extraQuantityInt === null) {
    addException(`Quantidade extra não é um inteiro (${extraQuantity})`);
    continue;
  }

  const clientUfMap = clientMap.get(clientKey);

  if (!clientUfMap || clientUfMap.size === 0) {
    addException('Cliente sem cadastro de filiais por UF');
    continue;
  }

  const clientUfs = Array.from(clientUfMap.values())
    .map((entry) => ({ ...entry, branchIds: [...entry.branchIds] }))
    .sort((a, b) => a.uf.localeCompare(b.uf));

  const nationalFleet = nationalFleetMap.get(partNumber) ?? 0;

  if (nationalFleet <= 0) {
    addException('Part Number sem frota nacional', { ufCount: clientUfs.length });
    continue;
  }

  let clientFleet = 0;

  for (const ufEntry of clientUfs) {
    ufEntry.fleetUf = fleetByPartUf.get(`${partNumber}|${ufEntry.uf}`) ?? 0;
    clientFleet += ufEntry.fleetUf;
  }

  // Regra 4: não distribuir sem frota nas UFs do cliente.
  if (clientFleet <= 0) {
    addException('Sem frota nas UFs onde o cliente possui filial', {
      nationalFleet,
      clientFleet,
      ufCount: clientUfs.length,
    });
    continue;
  }

  const realPercentageSum = clientFleet / nationalFleet;
  const leftoverPercentage = Math.max(0, 1 - realPercentageSum);
  const equalPercentage = leftoverPercentage / clientUfs.length;

  let baseQuantityTotal = 0;

  for (const ufEntry of clientUfs) {
    ufEntry.realPercentage = ufEntry.fleetUf / nationalFleet;
    ufEntry.finalPercentage = ufEntry.realPercentage + equalPercentage;
    ufEntry.exactQuota = extraQuantityInt * ufEntry.finalPercentage;
    ufEntry.baseQuantity = Math.floor(ufEntry.exactQuota + 1e-12);
    ufEntry.decimalRemainder = ufEntry.exactQuota - ufEntry.baseQuantity;
    baseQuantityTotal += ufEntry.baseQuantity;
  }

  const remainingQuantity = extraQuantityInt - baseQuantityTotal;

  const ranking = [...clientUfs].sort((a, b) => {
    const remainderDifference = b.decimalRemainder - a.decimalRemainder;
    if (Math.abs(remainderDifference) > 1e-12) return remainderDifference;
    if (b.fleetUf !== a.fleetUf) return b.fleetUf - a.fleetUf;
    return a.uf.localeCompare(b.uf);
  });

  ranking.forEach((ufEntry, rankingIndex) => {
    ufEntry.remainderRank = rankingIndex + 1;
    ufEntry.remainderBonus = rankingIndex < remainingQuantity ? 1 : 0;
  });

  let validationTotal = 0;

  for (const ufEntry of clientUfs) {
    const finalUfQuantity = ufEntry.baseQuantity + ufEntry.remainderBonus;
    validationTotal += finalUfQuantity;

    // NOVO: quebra Qtd_Final_UF em "real" (lastro de frota) vs "direcionada"
    // (sem lastro — vem só da redistribuição igualitária do % sobrante).
    // Derivado proporcionalmente do valor final já validado, com um único
    // arredondamento para o mais próximo, garantindo
    // Qtd_Real_Frota_UF + Qtd_Direcionada_UF === Qtd_Final_UF sempre.
    let qtdRealFrotaUf = 0;
    if (finalUfQuantity > 0 && ufEntry.finalPercentage > 0) {
      const realShareExact = finalUfQuantity * (ufEntry.realPercentage / ufEntry.finalPercentage);
      qtdRealFrotaUf = Math.min(finalUfQuantity, Math.round(realShareExact));
    }
    const qtdDirecionadaUf = finalUfQuantity - qtdRealFrotaUf;

    const basePerBranch = Math.floor(finalUfQuantity / ufEntry.branches);
    const branchesWithOneMore = finalUfQuantity % ufEntry.branches;
    const temIdentificacaoFilial = ufEntry.branchIds.length > 0;

    distribution.push({
      json: {
        Tipo_Registro: 'DISTRIBUICAO',
        Sales_Rows_Origem: salesRowsOrigem.join(','),
        Linhas_Fonte: linhasFonte,
        Cliente: clienteOriginal,
        Part_Number: partNumber,
        Familia: familia,
        Qtd_Extra_Cliente: extraQuantityInt,
        UF: ufEntry.uf,
        Filiais_UF: ufEntry.branches,
        Total_Filiais_Cliente: ufEntry.totalBranches,
        Fleet_UF: ufEntry.fleetUf,
        Fleet_UFs_Cliente: clientFleet,
        Fleet_Nacional: nationalFleet,
        Pct_Real_Fleet: ufEntry.realPercentage,
        Pct_Sobrante_Nacional: leftoverPercentage,
        Pct_Redistribuida_Igual: equalPercentage,
        Pct_Final: ufEntry.finalPercentage,
        Cota_Exata_UF: ufEntry.exactQuota,
        Qtd_Base_UF: ufEntry.baseQuantity,
        Resto_Decimal: ufEntry.decimalRemainder,
        Ordem_Maior_Resto: ufEntry.remainderRank,
        Bonus_Resto: ufEntry.remainderBonus,
        Qtd_Final_UF: finalUfQuantity,
        Qtd_Real_Frota_UF: qtdRealFrotaUf,
        Qtd_Direcionada_UF: qtdDirecionadaUf,
        Qtd_Base_Por_Filial: basePerBranch,
        Filiais_Com_Mais_1: branchesWithOneMore,
        Distribuicao_Filial_Estimada: !temIdentificacaoFilial,
        Status: 'DISTRIBUÍDO',
      },
    });

    // Divisão por filial real, só quando a planilha tem identificação de
    // filial para este Cliente+UF (ver BRANCH_ID_ALIASES).
    if (temIdentificacaoFilial) {
      const branchIds = [...ufEntry.branchIds].sort((a, b) => a.localeCompare(b));
      const perBranchBase = Math.floor(finalUfQuantity / branchIds.length);
      let perBranchRemainder = finalUfQuantity - perBranchBase * branchIds.length;

      branchIds.forEach((branchId, branchIndex) => {
        const bonus = branchIndex < perBranchRemainder ? 1 : 0;
        distributionFilial.push({
          json: {
            Tipo_Registro: 'DISTRIBUICAO_FILIAL',
            Cliente: clienteOriginal,
            Part_Number: partNumber,
            Familia: familia,
            UF: ufEntry.uf,
            Filial: branchId,
            Qtd_Final_Filial: perBranchBase + bonus,
          },
        });
      });
    }
  }

  if (validationTotal !== extraQuantityInt) {
    throw new Error(
      `Falha na preservação do total nas linhas ${salesRowsOrigem.join(',')}: ` +
        `${validationTotal} distribuído, esperado ${extraQuantityInt}.`,
    );
  }

  distributedRecords++;
  distributedQuantity += validationTotal;
}

// ============================================================
// RESUMO DA EXECUÇÃO — antes só ia para console.log (invisível no
// dashboard); agora também vira uma linha no resultado, para que o
// "Prepare Dashboard Payload" consiga expor essas métricas na UI.
// ============================================================

const resumo = {
  json: {
    Tipo_Registro: 'RESUMO_EXECUCAO',
    linhasVendaRecebidas: sales.length,
    linhasVendaIgnoradasNaoPositivas,
    linhasVendaUsandoAliasAmbiguoS: linhasUsandoAliasAmbiguoS,
    gruposClientePartNumber: salesGroups.size,
    linhasVendaDuplicatasExatasRemovidas: linhasVendaDuplicatasExatas,
    linhasVendaAgregadasPorDuplicidade: linhasVendaAgregadas,
    clientesUfRecebidos: clientUf.length,
    clientesUfDuplicatasExatasRemovidas: duplicatasExatasClienteUf,
    linhasComIdentificacaoFilial,
    linhasFleetRecebidas: fleet.length,
    fleetDuplicatasExatasRemovidas: duplicatasExatasFrota,
    registrosPositivos: positiveRecords,
    quantidadePositiva: positiveQuantity,
    registrosDistribuidos: distributedRecords,
    quantidadeDistribuida: distributedQuantity,
    registrosExcecao: exceptions.length,
    quantidadeNaoDistribuida: positiveQuantity - distributedQuantity,
    linhasDistribuicaoUf: distribution.length,
    linhasDistribuicaoFilial: distributionFilial.length,
    geradoEm: new Date().toISOString(),
  },
};

console.log(resumo.json);

return [...distribution, ...distributionFilial, ...exceptions, resumo];
