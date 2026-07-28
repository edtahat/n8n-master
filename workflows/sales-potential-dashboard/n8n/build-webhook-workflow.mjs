#!/usr/bin/env node
// Gera sales-potential-webhook.json a partir dos arquivos em code-nodes/
// (incluindo build-dashboard-html.js, que por sua vez é gerado a partir do
// build do dashboard React — rode dashboard/npm run build && npm run embed
// antes deste script).
//
// Uso: node build-webhook-workflow.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codeNodesDir = path.join(__dirname, 'code-nodes');
const buildDashboardHtmlPath = path.join(codeNodesDir, 'build-dashboard-html.js');

if (!fs.existsSync(buildDashboardHtmlPath)) {
  console.error(`Não encontrado: ${buildDashboardHtmlPath}`);
  console.error(
    'Rode, dentro de dashboard/: "npm run build" e depois "npm run embed" antes de gerar este workflow.',
  );
  process.exit(1);
}

function readCode(filename) {
  return fs.readFileSync(path.join(codeNodesDir, filename), 'utf8');
}

const nodes = [
  {
    id: '90763a9f-5feb-49a3-97c4-fc7000bd575f',
    name: 'Webhook - Dashboard Data',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2.1,
    position: [-1456, 704],
    webhookId: 'ea5524eb-b124-4337-afc0-3d5b3cbbd2e7',
    parameters: {
      path: 'sales-potential-dashboard',
      responseMode: 'responseNode',
      // FIX (revisão): este endpoint expunha dados internos de vendas/frota
      // (clientes, part numbers, volumes) sem NENHUMA autenticação — qualquer
      // pessoa com a URL via a página inteira. Adicionada autenticação por
      // header. Antes de importar este workflow: Credentials > New >
      // "Header Auth" (nome sugerido "Sales Potential Dashboard"), escolha um
      // nome de header (ex.: "X-Dashboard-Key") e um valor secreto; sem isso
      // configurado o node fica com a credencial pendente e o webhook não
      // responde. Ver README.md desta pasta para o passo a passo.
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
    position: [-1248, 704],
    parameters: { jsCode: readCode('read-dashboard-cache.js') },
  },
  {
    id: 'd5a1c806-08b6-4339-8891-90c1d21b1800',
    name: 'Build Dashboard HTML',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-1040, 704],
    parameters: { jsCode: readCode('build-dashboard-html.js') },
  },
  {
    id: '2858ec67-25eb-40dd-8163-502e427fab58',
    name: 'Respond to Webhook',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position: [-832, 704],
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

function chain(...names) {
  const connections = {};
  for (let i = 0; i < names.length - 1; i++) {
    connections[names[i]] = { main: [[{ node: names[i + 1], type: 'main', index: 0 }]] };
  }
  return connections;
}

const connections = chain(
  'Webhook - Dashboard Data',
  'Read Dashboard Cache',
  'Build Dashboard HTML',
  'Respond to Webhook',
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

const outPath = path.join(__dirname, 'sales-potential-webhook.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
console.log(`Escrito: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);

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
