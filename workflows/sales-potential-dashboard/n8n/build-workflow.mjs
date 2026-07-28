#!/usr/bin/env node
// Gera sales-potential-workflow.json — UM ÚNICO workflow n8n com dois
// triggers independentes (pipeline + webhook do dashboard).
//
// Por quê um workflow só, e não dois (como o original e a primeira revisão
// deste projeto): $getWorkflowStaticData('global') no n8n é isolado POR
// WORKFLOW — é dado gravado na coluna staticData da própria entidade do
// workflow no banco do n8n, não um key-value store da instância inteira. O
// desenho original (pipeline grava, workflow separado do webhook lê) nunca
// funcionou de verdade: cada workflow tem seu próprio staticData, então o
// webhook lia sempre um cache vazio, mesmo com o pipeline rodando com
// sucesso. Colocando os dois triggers no MESMO workflow, os dois passam a
// compartilhar o mesmo staticData — é exatamente esse compartilhamento que
// o "'global'" no nome do método promete, só que por workflow, não por
// instância.
//
// Uso: node build-workflow.mjs
// (rode dashboard/npm run build && npm run embed antes, se tiver mexido no
// dashboard React — ver README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codeNodesDir = path.join(__dirname, 'code-nodes');
const buildDashboardHtmlPath = path.join(codeNodesDir, 'build-dashboard-html.js');

if (!fs.existsSync(buildDashboardHtmlPath)) {
  console.error(`Não encontrado: ${buildDashboardHtmlPath}`);
  console.error(
    'Rode, dentro de dashboard/: "pnpm build" e depois "pnpm embed" antes de gerar este workflow.',
  );
  process.exit(1);
}

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

// ------------------------------------------------------------------
// Ramo 1: pipeline (SharePoint -> SQL -> distribuição -> cache)
// Mesmas posições/params da revisão anterior — só muda o arquivo de saída.
// ------------------------------------------------------------------
const pipelineNodes = [
  {
    id: 'f0739e8f-b13a-46fd-82a7-f2cc1201824a',
    name: 'When Executed by Another Workflow',
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1,
    position: [-2016, 16],
    parameters: {
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

// ------------------------------------------------------------------
// Ramo 2: webhook do dashboard (lê o cache, serve o React já compilado).
// Mesmo workflow, trigger diferente — agora enxerga o staticData que o
// ramo 1 grava, porque é a mesma entidade de workflow.
// ------------------------------------------------------------------
const webhookNodes = [
  {
    id: '90763a9f-5feb-49a3-97c4-fc7000bd575f',
    name: 'Webhook - Dashboard Data',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2.1,
    position: [-2016, 480],
    webhookId: 'ea5524eb-b124-4337-afc0-3d5b3cbbd2e7',
    parameters: {
      path: 'sales-potential-dashboard',
      responseMode: 'responseNode',
      // Este endpoint expõe dados internos de vendas/frota (clientes, part
      // numbers, volumes) — sem autenticação, qualquer pessoa com a URL via
      // a página inteira. Antes de importar: Credentials > New > "Header
      // Auth" (nome sugerido "Sales Potential Dashboard"), escolha um nome
      // de header (ex.: "X-Dashboard-Key") e um valor secreto, e selecione
      // essa credencial neste node. Sem isso configurado o node fica com a
      // credencial pendente e o webhook não responde. Se preferir manter
      // público (ex.: instância já atrás de VPN interna), troque
      // "authentication" de volta para "none".
      authentication: 'headerAuth',
      options: {},
    },
    credentials: {
      httpHeaderAuth: { id: 'PENDING_CONFIGURE_ME', name: 'Sales Potential Dashboard (configurar)' },
    },
  },
  {
    id: '63117011-b930-48e7-95e4-e40af7135d5b',
    name: 'Read Dashboard Cache',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-1792, 480],
    parameters: { jsCode: readCode('read-dashboard-cache.js') },
  },
  {
    id: 'd5a1c806-08b6-4339-8891-90c1d21b1800',
    name: 'Build Dashboard HTML',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-1568, 480],
    parameters: { jsCode: readCode('build-dashboard-html.js') },
  },
  {
    id: '2858ec67-25eb-40dd-8163-502e427fab58',
    name: 'Respond to Webhook',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position: [-1344, 480],
    parameters: {
      respondWith: 'text',
      responseBody: '={{ $json.htmlContent }}',
      options: {
        responseHeaders: {
          entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        },
      },
    },
  },
];

const nodes = [...pipelineNodes, ...webhookNodes];

function chain(names, { terminal = true } = {}) {
  const connections = {};
  for (let i = 0; i < names.length - 1; i++) {
    connections[names[i]] = { main: [[{ node: names[i + 1], type: 'main', index: 0 }]] };
  }
  if (terminal) connections[names[names.length - 1]] = { main: [[]] };
  return connections;
}

const connections = {
  ...chain([
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
  ]),
  ...chain(['Webhook - Dashboard Data', 'Read Dashboard Cache', 'Build Dashboard HTML', 'Respond to Webhook']),
};

const workflow = {
  nodes,
  connections,
  pinData: {},
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: '0f8f736fb3e0a4ecf7c21159c69dcdbb6e749369983d6828280e2610856c2681',
  },
};

const outPath = path.join(__dirname, 'sales-potential-workflow.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
console.log(`Escrito: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);

const nodeNames = new Set(nodes.map((n) => n.name));
if (nodeNames.size !== nodes.length) {
  console.error('ERRO: nomes de node duplicados entre os dois ramos.');
  process.exit(1);
}
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
