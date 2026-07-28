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
│   ├── build-pipeline-workflow.mjs    gera sales-potential-pipeline.json
│   ├── build-webhook-workflow.mjs     gera sales-potential-webhook.json
│   ├── sales-potential-pipeline.json  workflow corrigido, pronto pra importar
│   └── sales-potential-webhook.json   workflow corrigido, pronto pra importar
└── dashboard/                         app React (Vite+TS+Recharts), build único
    ├── src/...
    └── scripts/embed-into-workflow.mjs
```

Os `.json` em `n8n/` **não são editados à mão** — são gerados a partir dos
`.js` em `code-nodes/` (e, no caso do webhook, do bundle React compilado).
Isso existe porque o código de cada Code node é JavaScript de verdade (com
crases, template literals, aspas), e colar isso manualmente dentro de uma
string JSON é a origem mais comum de workflow quebrado por escaping errado.
Editar o `.js`, rodar o gerador, revisar o diff do `.json`.

## Bugs encontrados no fluxo original

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
`sales-potential-webhook.json`, crie uma credencial Header Auth em
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

### Alterar o dashboard e reimportar no n8n

```bash
cd workflows/sales-potential-dashboard/dashboard
# 1. edite src/, então:
pnpm typecheck
pnpm build     # gera dist/index.html (bundle único)
pnpm embed     # gera ../n8n/code-nodes/build-dashboard-html.js

cd ../n8n
node build-webhook-workflow.mjs   # gera sales-potential-webhook.json
```

Depois é só reimportar `sales-potential-webhook.json` no n8n (Import from
File, ou colar o JSON direto no canvas).

### Alterar a lógica de distribuição e reimportar

```bash
cd workflows/sales-potential-dashboard/n8n
# edite code-nodes/calculate-distribution.js (ou os outros .js), então:
node build-pipeline-workflow.mjs   # gera sales-potential-pipeline.json
```

## Como importar no n8n

1. `sales-potential-pipeline.json` — importe, confira/recrie as credenciais
   `Microsoft SharePoint` e `Microsoft SQL account` (os IDs de credencial do
   workflow original foram mantidos, mas credenciais não viajam no export —
   se a instância for diferente, é preciso reselecionar).
2. `sales-potential-webhook.json` — importe, configure a credencial Header
   Auth do node `Webhook - Dashboard Data` (ver item 7 acima) antes de
   ativar.
3. Rode `sales-potential-pipeline.json` pelo menos uma vez (ele que popula o
   cache que o webhook lê).
4. Acesse a URL do webhook (`/webhook/sales-potential-dashboard`) com o
   header configurado.

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
