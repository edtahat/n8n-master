#!/usr/bin/env node
// Gera sales-potential-pipeline.json a partir dos arquivos em code-nodes/.
//
// Por quê gerar em vez de editar o JSON à mão: o código de cada Code node é
// JavaScript de verdade (com template literals, aspas, backticks). Montar
// isso manualmente como string dentro de um JSON é fácil de errar; usar
// JSON.stringify() sobre um objeto normal do Node elimina esse risco de
// escaping por completo.
//
// Uso: node build-pipeline-workflow.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codeNodesDir = path.join(__dirname, 'code-nodes');

function readCode(filename) {
  return fs.readFileSync(path.join(codeNodesDir, filename), 'utf8');
}

const SHAREPOINT_SITE = {
  __rl: true,
  value: 'bosch.sharepoint.com,ea49b739-f519-4734-91e4-0ade5644a5b3,f18d8d40-4299-40de-8ddc-38ec09a0cccf',
  mode: 'list',
  cachedResultName: 'MA-LA Amplify the best of US',
};
const SHAREPOINT_FOLDER = {
  __rl: true,
  value: '014YGBPIYJDGGWYXQYCBGIEAYCE62XJ2GG',
  mode: 'list',
  cachedResultName: 'Sales Potential database',
};
const SHAREPOINT_CREDENTIALS = {
  microsoftSharePointOAuth2Api: { id: 'UxA1PJZPVsXu3vzh', name: 'Microsoft SharePoint' },
};

const nodes = [
  {
    id: 'f0739e8f-b13a-46fd-82a7-f2cc1201824a',
    name: 'When Executed by Another Workflow',
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1,
    position: [-2016, 16],
    parameters: {
      // FIX: o input original se chamava literalmente "Sales Potential v4.2"
      // e não era lido em nenhum lugar do fluxo — parece ter sido digitado
      // no campo errado (provavelmente pretendia ser a versão do workflow,
      // não um parâmetro de entrada). Nenhum node deste pipeline depende de
      // workflow inputs, então a lista foi esvaziada. Se o workflow que
      // chama este precisar mandar um parâmetro de verdade no futuro,
      // declare-o aqui com um nome descritivo.
      workflowInputs: { values: [] },
      returnOutput: 'allRuns',
    },
  },
  {
    id: crypto.randomUUID(),
    name: 'Baixar UFxCustomer.xlsx',
    type: 'n8n-nodes-base.microsoftSharePoint',
    typeVersion: 1,
    position: [-1792, 16],
    parameters: {
      site: SHAREPOINT_SITE,
      folder: SHAREPOINT_FOLDER,
      file: {
        __rl: true,
        value: '014YGBPIY43O2FSYDKIVB2K324KWESHG6V',
        mode: 'list',
        cachedResultName: 'UFxCustomer.xlsx',
      },
      requestOptions: {},
    },
    executeOnce: true,
    credentials: SHAREPOINT_CREDENTIALS,
  },
  {
    id: '1d7d9554-5559-420d-8bfd-2c5b69e828e8',
    name: 'Customer_Branch',
    type: 'n8n-nodes-base.extractFromFile',
    typeVersion: 1.1,
    position: [-1568, 16],
    parameters: { operation: 'xlsx', options: {} },
  },
  {
    id: crypto.randomUUID(),
    name: 'Baixar PBI_Sales_Potential.xlsx',
    type: 'n8n-nodes-base.microsoftSharePoint',
    typeVersion: 1,
    position: [-1344, 16],
    parameters: {
      site: SHAREPOINT_SITE,
      folder: SHAREPOINT_FOLDER,
      file: {
        __rl: true,
        value: '014YGBPIYK5M7G6MOINZGZXVEIHUA6HILT',
        mode: 'list',
        cachedResultName: 'PBI_Sales_Potential.xlsx',
      },
      requestOptions: {},
    },
    executeOnce: true,
    credentials: SHAREPOINT_CREDENTIALS,
  },
  {
    id: 'deb9441e-875c-4020-8a37-12935676cb14',
    name: 'PBI_Sales_Potential',
    type: 'n8n-nodes-base.extractFromFile',
    typeVersion: 1.1,
    position: [-1120, 16],
    parameters: { operation: 'xlsx', options: {} },
  },
  {
    id: '92d7814d-1b7a-46c4-b4ab-b5123f123578',
    name: 'Montar Lista de Materiais',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-896, 16],
    parameters: { jsCode: readCode('build-materials-list.js') },
  },
  {
    id: '5e869a16-eade-49ec-a136-97110ca76773',
    name: 'Fleet_percent',
    type: 'n8n-nodes-base.microsoftSql',
    typeVersion: 1.1,
    position: [-688, 16],
    parameters: {
      operation: 'executeQuery',
      query:
        'SELECT\n    [Material]\n   ,[UF]\n   ,[FROTA]\n   ,[Percentual_FROTA_UF]\nFROM [DB_SMS4_PJ_FT_TOTAL_SQL].[dbo].[SALES_POTENTIAL_VW_FROTA_UF]\nWHERE material IN ({{ $json.lista_materiais }})\n',
      options: {},
    },
    executeOnce: true,
    credentials: {
      microsoftSql: { id: 'qcyj5SxNsebcYrG0', name: 'Microsoft SQL account' },
    },
  },
  {
    id: '05d38936-c14b-40ea-8fde-17d81bdf2522',
    name: 'Calcular Distribuicao do Extra',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-432, 16],
    parameters: { jsCode: readCode('calculate-distribution.js') },
  },
  {
    id: '3b23005b-e54b-4837-a34f-a1608bd0f3cb',
    name: 'Prepare Dashboard Payload',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-208, 16],
    parameters: { jsCode: readCode('prepare-dashboard-payload.js') },
  },
  {
    id: '4dca7837-866a-46d4-a761-39bf72f51d5e',
    name: 'Save Dashboard Cache',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [16, 16],
    parameters: { jsCode: readCode('save-dashboard-cache.js') },
  },
];

function chain(...names) {
  const connections = {};
  for (let i = 0; i < names.length - 1; i++) {
    connections[names[i]] = { main: [[{ node: names[i + 1], type: 'main', index: 0 }]] };
  }
  connections[names[names.length - 1]] = { main: [[]] };
  return connections;
}

// FIX: o node "If1" (removido) só tinha a saída TRUE conectada — a saída
// FALSE, que levaria todas as linhas Tipo_Registro=EXCECAO, nunca foi ligada
// a nada, então todo erro de distribuição era descartado sem deixar rastro.
// Em vez de religar as duas saídas de um IF (fácil de esquecer de novo no
// futuro), o filtro foi removido: TODAS as linhas seguem direto para
// "Prepare Dashboard Payload", que agora separa DISTRIBUICAO/
// DISTRIBUICAO_FILIAL/EXCECAO/RESUMO_EXECUCAO internamente.
const connections = chain(
  'When Executed by Another Workflow',
  'Baixar UFxCustomer.xlsx',
  'Customer_Branch',
  'Baixar PBI_Sales_Potential.xlsx',
  'PBI_Sales_Potential',
  'Montar Lista de Materiais',
  'Fleet_percent',
  'Calcular Distribuicao do Extra',
  'Prepare Dashboard Payload',
  'Save Dashboard Cache',
);

const workflow = {
  nodes,
  connections,
  pinData: {},
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: '0f8f736fb3e0a4ecf7c21159c69dcdbb6e749369983d6828280e2610856c2681',
  },
};

const outPath = path.join(__dirname, 'sales-potential-pipeline.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
console.log(`Escrito: ${outPath}`);

// Checagens estruturais básicas: todo destino de conexão precisa existir
// como node, e todo node (exceto o último) precisa aparecer como origem.
const nodeNames = new Set(nodes.map((n) => n.name));
let ok = true;
for (const [from, def] of Object.entries(connections)) {
  if (!nodeNames.has(from)) {
    console.error(`ERRO: conexão a partir de node inexistente: ${from}`);
    ok = false;
  }
  for (const branch of def.main) {
    for (const conn of branch) {
      if (!nodeNames.has(conn.node)) {
        console.error(`ERRO: conexão para node inexistente: ${conn.node}`);
        ok = false;
      }
    }
  }
}
if (!ok) process.exit(1);
console.log('Checagem estrutural: OK');
