# Sales Potential — revisão do fluxo n8n + dashboard React

Revisão do pipeline "Sales Potential v4.2" (SharePoint → SQL Server → cálculo
de distribuição → dashboard via webhook) e reconstrução do dashboard em React.
Este documento lista os bugs encontrados, o que foi corrigido, o que ficou
como recomendação, e como rebuildar/reimportar tudo.

## Estrutura

```
workflows/sales-potential-dashboard/
├── README.md                          este arquivo
├── n8n/
│   ├── code-nodes/*.js                código de cada Code node, como .js de verdade
│   ├── build-workflow.mjs             gera sales-potential-workflow.json
│   └── sales-potential-workflow.json  workflow corrigido, pronto pra importar
└── dashboard/                         app React (Vite+TS+Recharts), build único
    ├── src/...
    └── scripts/embed-into-workflow.mjs
```

**É um workflow só** (pipeline + webhook do dashboard no mesmo arquivo, dois
triggers independentes) — ver "Bug 0" logo abaixo pra entender por quê. Uma
revisão anterior deste projeto tinha entregado dois arquivos separados
(`sales-potential-pipeline.json` + `sales-potential-webhook.json`); eles
foram removidos porque essa divisão não funciona (o cache do dashboard nunca
era preenchido de verdade — é exatamente o "Bug 0").

Os `.json` em `n8n/` **não são editados à mão** — são gerados a partir dos
`.js` em `code-nodes/` (e, no caso do webhook, do bundle React compilado).
Isso existe porque o código de cada Code node é JavaScript de verdade (com
crases, template literals, aspas), e colar isso manualmente dentro de uma
string JSON é a origem mais comum de workflow quebrado por escaping errado.
Editar o `.js`, rodar o gerador, revisar o diff do `.json`.

## Bugs encontrados no fluxo original

### 0. Cache do dashboard nunca era preenchido — dois workflows não compartilham `$getWorkflowStaticData`

Este é o bug mais grave dos dois workflows originais, e não some com nenhuma
correção de lógica de negócio: `Save Dashboard Cache1` (no pipeline) e `Read
Dashboard Cache` (no webhook) estavam em **workflows n8n diferentes** — dois
arquivos JSON separados, importados como duas entidades de workflow
distintas. `$getWorkflowStaticData('global')` não é um key-value store da
instância inteira; é dado gravado na coluna `staticData` da própria
**linha, no banco do n8n, daquele workflow específico**
(`packages/cli/src/workflows/workflow-static-data.service.ts`, método
`saveStaticDataById(workflowId, ...)` — grava com `WHERE id = :id`, e
`getStaticDataById(workflowId)` lê com o mesmo filtro). Rodar o pipeline
grava no `staticData` do workflow A; o webhook lê o `staticData` do workflow
B — nunca vê o que o pipeline gravou, **mesmo que o pipeline tenha rodado
com sucesso**. É exatamente o sintoma "rodei o `When Executed by Another
Workflow` e o dashboard continua em 'Nenhum dado calculado ainda'".

**Correção:** os dois triggers (`When Executed by Another Workflow` e
`Webhook - Dashboard Data`) agora vivem no **mesmo workflow**
(`sales-potential-workflow.json`), cada um com sua própria cadeia de nodes,
sem se conectar um ao outro no canvas — mas como são a mesma entidade de
workflow, compartilham o mesmo `staticData`. Isso resolve o problema sem
precisar de nenhuma infraestrutura nova (banco, arquivo compartilhado).

Se por alguma razão vocês precisarem manter pipeline e webhook como
workflows separados (ex.: dono/permissão diferente para cada um no n8n), o
cache **precisa** virar um armazenamento externo de verdade — por exemplo
uma tabelinha em `DB_SMS4_PJ_FT_TOTAL_SQL` (a mesma base que `Fleet_percent`
já consulta) com uma linha `(payload_json, atualizado_em)`, que o pipeline
faz UPSERT e o webhook faz SELECT. Não implementei essa variante porque
não sei se a credencial SQL configurada tem permissão de escrita/DDL nessa
base — é só avisar que se precisarem dela eu faço.

### 0.1. Mesmo com os dois num workflow só: testar com "Execute workflow" no editor NUNCA preenche o cache

Esse é o motivo mais provável de o dashboard continuar vazio mesmo depois do
fix acima. É um comportamento pouco divulgado do próprio n8n, confirmado no
código-fonte (`packages/cli/src/execution-lifecycle/execution-lifecycle-hooks.ts`,
funções `hookFunctionsSave`/`hookFunctionsSaveWorker`):

```ts
const isManualMode = this.mode === 'manual';
if (!isManualMode && isWorkflowIdValid(this.workflowData.id) && newStaticData) {
  // só salva se NÃO for execução manual
  await workflowStaticDataService.saveStaticDataById(this.workflowData.id, newStaticData);
}
```

Clicar **"Execute workflow"** (▶) no editor do n8n roda em modo `manual`. A
execução parece funcionar normalmente — os dados passam pelos nodes, você vê
o resultado em cada um — mas as mudanças em `$getWorkflowStaticData` são
**descartadas no final da execução, nunca gravadas no banco**. Isso vale
tanto pra testar o node `When Executed by Another Workflow` quanto qualquer
outro trigger clicado manualmente no canvas.

**Correção:** adicionei um segundo trigger só pro ramo do pipeline —
`Atualizar Dashboard (Agenda)` (Schedule Trigger, 1x por hora por padrão,
ajustável no node). Execuções disparadas pela agenda (ou por um workflow pai
de verdade chamando via "Execute Workflow") **não** são modo `manual`, então
persistem o cache normalmente. Os dois triggers (`When Executed by Another
Workflow` e `Atualizar Dashboard (Agenda)`) convergem pro mesmo primeiro node
real (`Baixar UFxCustomer.xlsx`) — qualquer um dos dois dispara o pipeline
inteiro.

**Isso só funciona com o workflow ativado** (toggle "Active" no canto
superior direito do editor) — igual já valia pro webhook. Uma agenda de 1x
por hora não ajuda a testar *agora*; pra confirmar rápido que o fix
funcionou, edite temporariamente o node `Atualizar Dashboard (Agenda)` pra
"Seconds" com um intervalo curto (ex. 30s), ative o workflow, espere um
ciclo, confira o dashboard, e depois volte o intervalo pro valor de produção
que fizer sentido pra vocês (1h é só um ponto de partida — se a planilha do
SharePoint só muda uma vez por dia, uma vez por dia já bastaria).

### 1. Exceções descartadas silenciosamente (o bug mais provável por trás de "erros que eu não consigo ver")

O node `If1` filtrava `Tipo_Registro == DISTRIBUICAO`, mas só a saída
**TRUE** estava conectada a algum lugar. A saída FALSE — que levaria todo
registro `Tipo_Registro = EXCECAO` (cliente sem cadastro, part number sem
frota, etc.) — nunca foi ligada a nada. Todo erro de distribuição
desaparecia sem deixar rastro nenhum: nem no dashboard, nem em log algum
lugar visível.

**Correção:** o node `If1` foi removido. `Calcular Distribuicao do Extra`
agora manda TODAS as linhas (`DISTRIBUICAO` + `DISTRIBUICAO_FILIAL` +
`EXCECAO` + `RESUMO_EXECUCAO`) direto pra `Prepare Dashboard Payload`, que
separa por `Tipo_Registro` internamente. Não tem mais uma segunda saída pra
esquecer de ligar. O dashboard agora tem um painel "Exceções (não
distribuído)" mostrando cliente, part number, motivo e quanto ficou de fora.

### 2. Linhas de venda duplicadas inflavam o resultado final

O loop principal processava cada linha de `PBI_Sales_Potential`
independentemente. Se a planilha tivesse duas linhas para o mesmo
Cliente+Part Number (comum em exports do Power BI), o extra era distribuído
**duas vezes** — provavelmente a principal causa dos "dados duplicados no
resultado final".

**Correção:** as linhas agora são agrupadas por Cliente+Part Number antes de
distribuir. Duplicata **exata** (mesmo valor) → mantém uma, descarta o
resto, conta em `linhasVendaDuplicatasExatasRemovidas`. Duplicata com
**valores diferentes** → soma (`linhasVendaAgregadasPorDuplicidade`), e cada
linha final carrega `Sales_Rows_Origem` com todas as linhas de origem, pra
auditoria. Os dois contadores aparecem na tira de auditoria no rodapé do
dashboard.

### 3. Mesmo problema em Customer_Branch e Fleet_percent

Linhas exatamente repetidas em `Customer_Branch` (mesmo cliente+UF+filiais)
ou em `Fleet_percent` (mesmo material+UF+frota) eram somadas sem checagem —
um artefato de exportação/join duplicava filiais ou frota silenciosamente.
Agora duplicatas exatas são detectadas e ignoradas (contadas em
`clientesUfDuplicatasExatasRemovidas` / `fleetDuplicatasExatasRemovidas`).
Importante: isso só descarta repetições **idênticas**; se o cliente
realmente tem duas filiais distintas na mesma UF com os mesmos números por
coincidência, isso não é (e não pode ser, sem um identificador de filial)
diferenciado de uma duplicata de exportação — ver seção "Limitações" abaixo.

### 4. Verificação de número inteiro rejeitava valores válidos

`Number.isInteger(extraQuantity)` rejeitava algo como `45.000000000012`
— ruído de ponto flutuante comum em exports do Excel/Power BI — jogando uma
linha perfeitamente válida pra exceção. Trocado por arredondamento tolerante
(`roundNearInteger`, tolerância `1e-6`): só vira exceção se o valor
estiver genuinamente longe de um inteiro (ex.: `33.5`).

### 5. Lista de materiais (SQL IN) usava um único nome de coluna; o resto do fluxo aceitava vários

`Code in JavaScript` (agora `Montar Lista de Materiais`) só reconhecia a
coluna `"10 dígitos"`. Mas `Code in JavaScript3` já aceitava várias
variações (`Part Number`, `Part_Number`, `Material`...) pra essa mesma
coluna. Se a planilha usasse um desses nomes alternativos, a lista de
materiais saía **vazia**, a consulta de frota voltava zerada, e todo mundo
caía na exceção "Part Number sem frota nacional" — um bug que parecia
problema de frota mas era nome de coluna. Os dois nodes agora usam a mesma
lista de aliases (mantida sincronizada manualmente, com um comentário em
cada arquivo apontando pro outro — Code nodes do n8n não compartilham
import). O node também agora falha alto e explica o problema, em vez de
seguir silenciosamente com uma lista vazia, se nenhuma linha tiver a coluna
reconhecida.

### 6. Campo de entrada do trigger não utilizado

`When Executed by Another Workflow` tinha um input chamado literalmente
`"Sales Potential v4.2"` — não é lido em lugar nenhum do fluxo. Parece ter
sido digitado no campo errado (provavelmente pretendia ser a versão do
workflow). Removido; nada no pipeline depende de workflow inputs.

### 7. Webhook do dashboard sem autenticação

`Webhook - Dashboard Data` respondia publicamente, sem nenhuma
autenticação — qualquer pessoa com a URL via nomes de clientes, part
numbers e volumes de venda internos. Adicionado `authentication: headerAuth`
no node. **Isso muda o comportamento**: depois de importar
`sales-potential-workflow.json`, crie uma credencial Header Auth em
Credentials → New → "Header Auth" (nome sugerido: "Sales Potential
Dashboard"), escolha um nome de header (ex. `X-Dashboard-Key`) e um valor
secreto, e selecione essa credencial no node antes de ativar o workflow —
sem isso o webhook fica com a credencial pendente. Se preferir manter o
endpoint público (ex.: já está atrás de uma VPN/rede interna que só a Bosch
acessa), é só trocar `authentication` de volta pra `"none"` no node depois
de importar.

### 8. Nomes de node genéricos

`Download file` / `Download file1`, `Code in JavaScript` / `Code in
JavaScript3`, `If1` — renomeados pra `Baixar UFxCustomer.xlsx`, `Baixar
PBI_Sales_Potential.xlsx`, `Montar Lista de Materiais`, `Calcular
Distribuicao do Extra`; `If1` foi removido (ver item 1); `Save Dashboard
Cache1` perdeu o "1" órfão.

## Não corrigido — documentado como recomendação

**`Baixar PBI_Sales_Potential.xlsx` está encadeado depois de
`Customer_Branch` sem depender dos dados dele** — só está nessa posição por
sequenciamento. Isso cria uma fragilidade real: se `Customer_Branch` não
gerar nenhuma linha (arquivo vazio/corrompido), o resto do pipeline inteiro
para silenciosamente — o dashboard fica com o cache antigo pra sempre, sem
erro visível. A correção certa é paralelizar os dois downloads (trigger →
dois ramos independentes → Merge → resto do fluxo). Não apliquei essa
mudança porque não tenho como testar contra uma instância n8n real com as
credenciais de SharePoint/SQL de vocês, e o comportamento exato do n8n
quando um ramo produz zero itens antes de um node Merge varia por versão —
prefiro não arriscar trocar uma fragilidade conhecida por uma não-testada.
Se quiserem, é uma mudança de ~15 min com acesso a uma instância de teste.

**IN clause do SQL montado por concatenação de string.** Funciona (escapa
aspas simples), mas não escala bem pra listas muito grandes e é mais frágil
que usar uma tabela temporária/parâmetro de tabela. Fora do escopo desta
revisão.

## Novidades pedidas

**"Quantas peças por filial por cliente"** — a planilha `UFxCustomer.xlsx`,
do jeito que está, parece trazer só uma **contagem** de filiais por
Cliente+UF (colunas tipo `filiais`, `total_filiais_cliente`), não um
identificador por filial individual — então não dá pra saber com certeza
qual filial específica recebe quantas peças. O node `Calcular Distribuicao
do Extra` agora detecta automaticamente se a planilha tem uma coluna de
identificação de filial (`Filial`, `Codigo_Filial`, `Nome_Filial`, etc. —
ver `BRANCH_ID_ALIASES` no código). Se tiver, a divisão é feita por filial
real (linhas `DISTRIBUICAO_FILIAL`, mesmo método do maior resto usado pra
UF). Se não tiver, cai pro método anterior (estimativa uniforme:
`Qtd_Base_Por_Filial` + `Filiais_Com_Mais_1`), agora marcado explicitamente
com `Distribuicao_Filial_Estimada: true` pra não ser lido como exato. O
painel "Peças por filial, por cliente" no dashboard mostra os dois casos, com
a estimativa visualmente diferenciada (itálico + tooltip explicando).

**"Distribuição real da distribuição direcionada (extra não encontrado na
frota)"** — cada linha de distribuição agora expõe `Qtd_Real_Frota_UF`
(parte com lastro real de frota conhecida) e `Qtd_Direcionada_UF` (parte sem
lastro — só a divisão igualitária do % sobrante entre as UFs do cliente). A
soma das duas sempre bate exatamente com `Qtd_Final_UF` (verificado nos
testes). O dashboard tem um gráfico dedicado ("Real vs. Direcionada, por
UF") pra essa quebra.

## Dashboard React

Reescrito em React 18 + TypeScript + Recharts, build único via Vite
(`vite-plugin-singlefile`) — o resultado (`dist/index.html`) é uma página
autocontida, sem `<script src>`/`<link>` externos, mesma garantia do
dashboard anterior de não depender de CDN nem sofrer CORS (relevante numa
rede corporativa que costuma bloquear CDN externo). O HTML compilado é
embutido no node `Build Dashboard HTML` do workflow de webhook — o build do
React roda uma vez, não a cada request.

Cores e forma dos gráficos seguem a skill interna de dataviz: paleta
categórica de 8 posições fixas (nunca cicladas), rampa sequencial de um hue
só pra magnitude (o "mapa" de bolhas do dashboard anterior virou uma barra
horizontal ordenada — mais honesto que fingir ser geografia real com
coordenadas aproximadas), barras empilhadas com legenda para a comparação
Real/Direcionada, tooltips com valor em destaque, tabela como fallback de
acessibilidade em toda visão.

**Painéis:** KPIs, filtros (UF/Família/Cliente/Part Number, numa linha só,
escopando tudo abaixo), quantidade por UF, top 10 clientes, top 10 part
numbers, Real vs. Direcionada por UF, peças por filial por cliente,
exceções, detalhamento paginado/ordenável, e uma tira de auditoria no
rodapé com os contadores de duplicata/exceção da última execução.

### Rodar localmente (preview com dados de exemplo)

Este projeto fica fora dos globs do `pnpm-workspace.yaml` da raiz (não é um
pacote do monorepo n8n, é um app standalone) — por isso o install usa
`--ignore-workspace`, pra não tentar linkar com o workspace da raiz nem
mexer no `pnpm-lock.yaml` de lá:

```bash
cd workflows/sales-potential-dashboard/dashboard
pnpm install --ignore-workspace
pnpm dev
```

Abre com dados de exemplo gerados localmente (`src/mockData.ts`) — não
precisa de n8n rodando. Botão "Usar dados de exemplo" no topo da página
regenera esses dados a qualquer momento.

### Alterar e reimportar no n8n

Editou um `code-nodes/*.js` (lógica de distribuição, cache, etc.)? Só
precisa regenerar o workflow:

```bash
cd workflows/sales-potential-dashboard/n8n
node build-workflow.mjs   # gera sales-potential-workflow.json
```

Editou o dashboard React (`dashboard/src/`)? Precisa buildar e embutir antes
de regenerar o workflow:

```bash
cd workflows/sales-potential-dashboard/dashboard
pnpm typecheck
pnpm build     # gera dist/index.html (bundle único)
pnpm embed     # gera ../n8n/code-nodes/build-dashboard-html.js

cd ../n8n
node build-workflow.mjs   # gera sales-potential-workflow.json
```

Nos dois casos, o passo final é reimportar `sales-potential-workflow.json`
no n8n (Import from File, ou colar o JSON direto no canvas) — os dois
triggers (pipeline e webhook) vêm juntos no mesmo arquivo.

## Como importar no n8n

1. Apague os workflows separados de uma tentativa anterior, se houver
   (pipeline e webhook como arquivos distintos) — eles não funcionam, ver
   Bug 0.
2. Importe `sales-potential-workflow.json` — um workflow só, com três
   triggers no canvas: `When Executed by Another Workflow` e `Atualizar
   Dashboard (Agenda)` em cima (convergem pro mesmo pipeline), `Webhook -
   Dashboard Data` embaixo.
3. Confira/recrie as credenciais `Microsoft SharePoint` e `Microsoft SQL
   account` nos nodes do ramo de cima (os IDs de credencial do workflow
   original foram mantidos, mas credenciais não viajam no export — se a
   instância for diferente, é preciso reselecionar).
4. No node `Webhook - Dashboard Data`, configure a credencial Header Auth
   (ver item 7 do bug list acima) antes de ativar.
5. **(Opcional, só pra confirmar rápido que está tudo funcionando)** No node
   `Atualizar Dashboard (Agenda)`, troque o intervalo pra "Seconds" / 30s
   temporariamente — assim não precisa esperar 1h pra ver o primeiro
   resultado.
6. **Ative o workflow** (toggle "Active", canto superior direito). Isso é
   necessário pelos dois motivos abaixo, não só um:
   - o node webhook só escuta na URL de **produção** (`/webhook/...`, sem
     `-test`) quando ativo — `/webhook-test/...` só funciona por uma
     execução após clicar "Listen for test event" no editor, não fica no
     ar continuamente (se o print de vocês veio de `/webhook-test/...`, é
     por isso);
   - **e**, mais importante: só execuções não-manuais (agenda, webhook,
     workflow pai) persistem `$getWorkflowStaticData` de volta no banco —
     clicar "Execute workflow" no editor para testar **nunca** preenche o
     cache, mesmo que pareça ter rodado com sucesso (ver Bug 0.1).
7. Espere um ciclo da agenda (30s se você mudou no passo 5, senão até 1h) e
   confira o dashboard. Se ajustou o intervalo pra teste, volte pro valor
   de produção depois de confirmar (ex. `1x por hora`, ou diário se a
   planilha do SharePoint só atualiza uma vez por dia).
8. Acesse a URL do webhook (sem `-test`) com o header configurado.

## Verificação feita

Como não há uma instância n8n real disponível aqui (sem as credenciais de
SharePoint/SQL), a lógica de negócio foi testada isoladamente: o arquivo
`calculate-distribution.js` foi executado num sandbox Node (`vm`) com dados
sintéticos cobrindo duplicata exata de venda, duplicata agregada (valores
diferentes), duplicata exata em Customer_Branch e em Fleet_percent, ruído de
ponto flutuante, valor não-inteiro real, cliente/part number vazios,
cliente sem cadastro, part number sem frota, e o caso com identificação de
filial real — 22 asserções, todas passando, incluindo a invariante
`Qtd_Real_Frota_UF + Qtd_Direcionada_UF === Qtd_Final_UF` em 100% das
linhas. O dashboard React foi buildado, typechecado (`tsc -b`, sem erros) e
renderizado de ponta a ponta num Chromium headless — com dados de exemplo e
com um payload simulando exatamente o formato que `Prepare Dashboard
Payload` produz (incluindo um teste deliberado de quebra de `<script>` via
`</script><b>` num nome de cliente, confirmando que o payload é escapado
corretamente e o React nunca interpreta esse texto como HTML).

O fix do "Bug 0" (cache nunca preenchido) foi conferido direto no código-fonte
do n8n incluído neste repositório, não só por conhecimento geral: veja
`packages/cli/src/workflows/workflow-static-data.service.ts` —
`getStaticDataById`/`saveStaticDataById` operam com `WHERE id = :id` sobre a
linha do workflow no banco, confirmando que não existe nenhum
compartilhamento entre workflows diferentes.

## Limitações conhecidas

- A dedução de "duplicata exata" em `Customer_Branch`/`Fleet_percent` não
  consegue diferenciar "linha repetida por erro de exportação" de "duas
  filiais/registros genuinamente diferentes que por coincidência têm os
  mesmos números" quando não há um identificador único por linha. Se depois
  dessa mudança os totais de filiais ou frota caírem de forma inesperada
  pra algum cliente/material específico, é o primeiro lugar a olhar — os
  contadores `clientesUfDuplicatasExatasRemovidas` e
  `fleetDuplicatasExatasRemovidas` no `RESUMO_EXECUCAO` dizem exatamente
  quantas linhas foram descartadas por execução.
- Recharts está na v2 (a v3 é a versão ativamente mantida atualmente); a API
  usada aqui é estável e amplamente compatível, mas vale considerar migrar
  numa próxima manutenção.
- `npm audit` acusa uma vulnerabilidade em `esbuild`/`vite` que só afeta o
  **servidor de dev** (`vite dev`), não o build de produção usado aqui
  (`vite build`) — não é um risco no artefato final.
