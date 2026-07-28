// Monta a lista de materiais (10 dígitos / Part Number) presentes na planilha
// PBI_Sales_Potential, para restringir a consulta de frota (Fleet_percent) só
// aos materiais que realmente aparecem nesta execução.
//
// FIX (revisão): antes este node só reconhecia a coluna "10 dígitos". O node
// "Calcular Distribuicao do Extra" já aceitava vários nomes alternativos
// (Part Number, Part_Number, Material...) para a MESMA coluna. Se a planilha
// usasse um desses nomes alternativos, este node gerava lista_materiais vazia
// ('') sem avisar, a consulta SQL de frota voltava zerada, e TODAS as linhas
// caíam depois na exceção "Part Number sem frota nacional" — um bug que
// parecia um problema de frota mas na verdade era de nome de coluna.
//
// Mantenha PART_NUMBER_ALIASES em sincronia com os aliases usados para
// Part_Number no node "Calcular Distribuicao do Extra".
const PART_NUMBER_ALIASES = [
  '10dígitos',
  '10 dígitos',
  '10 digitos',
  '10digitos',
  'Part Number',
  'Part_Number',
  'Material',
];

const DIACRITICS_REGEX = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalizeKey(key) {
  return String(key ?? '')
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

const targetKeys = new Set(PART_NUMBER_ALIASES.map(normalizeKey));

const allItems = $input.all();

const rawValues = [];
let linhasSemColunaReconhecida = 0;

for (const item of allItems) {
  const matchedKey = Object.keys(item.json).find((k) => targetKeys.has(normalizeKey(k)));

  if (!matchedKey) {
    linhasSemColunaReconhecida++;
    continue;
  }

  const val = item.json[matchedKey];
  if (val === null || val === undefined) continue;

  const strVal = String(val).trim();
  if (strVal !== '') rawValues.push(strVal);
}

// Boundary check: isto é dado externo (planilha do SharePoint). Se NENHUMA
// linha tiver uma coluna reconhecível, é melhor falhar alto e claro aqui do
// que deixar o resto do pipeline rodar silenciosamente com frota zerada.
if (allItems.length > 0 && linhasSemColunaReconhecida === allItems.length) {
  const cabecalhosEncontrados = Object.keys(allItems[0]?.json ?? {}).join(', ') || '(nenhum)';
  throw new Error(
    'Nenhuma linha de PBI_Sales_Potential tem uma coluna reconhecida como Part Number/10 dígitos. ' +
      `Cabeçalhos encontrados: ${cabecalhosEncontrados}. ` +
      'Adicione o nome real da coluna em PART_NUMBER_ALIASES neste node.',
  );
}

const distinctValues = [...new Set(rawValues)];

let sqlInString = distinctValues.map((m) => `'${m.replace(/'/g, "''")}'`).join(',');

// Prevenção de erro: se o arquivo não tiver nenhum código válido, injeta ''
if (sqlInString === '') {
  sqlInString = "''";
}

return [
  {
    json: {
      lista_materiais: sqlInString,
      total_materiais_distintos: distinctValues.length,
      linhas_sem_coluna_reconhecida: linhasSemColunaReconhecida,
    },
  },
];
