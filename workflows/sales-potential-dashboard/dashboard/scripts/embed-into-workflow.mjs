#!/usr/bin/env node
// Gera n8n/code-nodes/build-dashboard-html.js a partir de dashboard/dist/index.html
// (o bundle React já compilado, arquivo único — ver vite.config.ts).
//
// Por quê gerar em vez de colar o HTML à mão num Code node: o bundle
// compilado contém aspas simples, duplas E crases (o React/Recharts minificado
// usa template literals) — colar isso dentro de uma string JS escrita à mão
// quebraria na primeira crase. JSON.stringify() escapa tudo automaticamente,
// então a única forma seria seguir por esse caminho de qualquer forma; gerar
// o arquivo inteiro programaticamente evita qualquer edição manual arriscada.
//
// Uso (dentro de dashboard/): npm run build && npm run embed

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distHtmlPath = path.join(__dirname, '..', 'dist', 'index.html');
const outPath = path.join(__dirname, '..', '..', 'n8n', 'code-nodes', 'build-dashboard-html.js');

if (!fs.existsSync(distHtmlPath)) {
  console.error(`Não encontrado: ${distHtmlPath}`);
  console.error('Rode "npm run build" dentro de dashboard/ antes de "npm run embed".');
  process.exit(1);
}

let html = fs.readFileSync(distHtmlPath, 'utf8');

const PLACEHOLDER = '__N8N_DASHBOARD_PAYLOAD_PLACEHOLDER__';
const injection = `<script>window.__N8N_PAYLOAD__ = ${PLACEHOLDER};</script>`;

if (!html.includes('<head>')) {
  console.error('dist/index.html não tem uma tag <head> exata — build inesperado do Vite, ajuste este script.');
  process.exit(1);
}
html = html.replace('<head>', `<head>\n    ${injection}`);

if (!html.includes(PLACEHOLDER)) {
  console.error('Placeholder não sobreviveu à injeção — algo inesperado no HTML do build.');
  process.exit(1);
}
if ((html.match(new RegExp(PLACEHOLDER, 'g')) ?? []).length !== 1) {
  console.error('Placeholder apareceu mais de uma vez (ou nenhuma) — abortando por segurança.');
  process.exit(1);
}

const htmlLiteral = JSON.stringify(html);

// Constrói a sequência de escape "<" (barra invertida + u003c) via
// String.fromCharCode em vez de digitá-la — o próprio código deste gerador é
// um template literal, e qualquer barra invertida escrita aqui precisaria
// ser duplicada (ou triplicada) para sobreviver à camada de cima; gerar por
// código elimina esse tipo de erro por completo.
const nodeSource = `// GERADO POR dashboard/scripts/embed-into-workflow.mjs — NÃO EDITAR À MÃO.
// Para atualizar: edite dashboard/src, rode "npm run build" e depois
// "npm run embed" (ambos dentro de workflows/sales-potential-dashboard/dashboard/),
// depois regenere o workflow com "node ../n8n/build-webhook-workflow.mjs".
//
// HTML_TEMPLATE é a página React já compilada: bundle único, sem <script src>
// nem <link> externos (ver dashboard/vite.config.ts) — mantém a mesma
// garantia do dashboard anterior de não depender de CDN/fetch externo. Em
// cada chamada do webhook, este node só troca o placeholder pelo payload já
// calculado (lido do cache por "Read Dashboard Cache"); o build do React não
// roda a cada request.
const HTML_TEMPLATE = ${htmlLiteral};

const payload = $input.first().json;
const LT_ESCAPE = String.fromCharCode(92) + 'u003c'; // texto literal: \\u003c
const payloadJson = JSON.stringify(payload).split('<').join(LT_ESCAPE);
const html = HTML_TEMPLATE.replace('${PLACEHOLDER}', payloadJson);

return [{ json: { htmlContent: html } }];
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, nodeSource, 'utf8');
console.log(`Escrito: ${outPath} (${(nodeSource.length / 1024).toFixed(0)} KB)`);
