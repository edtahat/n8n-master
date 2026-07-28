export interface DistributionRow {
  Tipo_Registro: 'DISTRIBUICAO';
  Sales_Rows_Origem: string;
  Linhas_Fonte: number;
  Cliente: string;
  Part_Number: string;
  Familia: string;
  Qtd_Extra_Cliente: number;
  UF: string;
  Filiais_UF: number;
  Total_Filiais_Cliente: number;
  Fleet_UF: number;
  Fleet_UFs_Cliente: number;
  Fleet_Nacional: number;
  Pct_Real_Fleet: number;
  Pct_Sobrante_Nacional: number;
  Pct_Redistribuida_Igual: number;
  Pct_Final: number;
  Cota_Exata_UF: number;
  Qtd_Base_UF: number;
  Resto_Decimal: number;
  Ordem_Maior_Resto: number;
  Bonus_Resto: number;
  Qtd_Final_UF: number;
  /** Parte de Qtd_Final_UF com lastro real de frota (Pct_Real_Fleet). */
  Qtd_Real_Frota_UF: number;
  /** Parte "direcionada": sem lastro de frota, vem da redistribuição igual do % sobrante. */
  Qtd_Direcionada_UF: number;
  Qtd_Base_Por_Filial: number;
  Filiais_Com_Mais_1: number;
  /** true quando a planilha de origem não tinha identificação de filial (estimativa uniforme). */
  Distribuicao_Filial_Estimada: boolean;
  Status: string;
}

export interface ExceptionRow {
  Tipo_Registro: 'EXCECAO';
  Sales_Rows_Origem: string;
  Linhas_Fonte: number;
  Cliente: string;
  Part_Number: string;
  Familia: string;
  Qtd_Extra_Cliente: number;
  Motivo: string;
  Fleet_Nacional: number;
  Fleet_UFs_Cliente: number;
  Qtd_UFs_Cliente: number;
  Status: string;
}

export interface ResumoExecucao {
  Tipo_Registro: 'RESUMO_EXECUCAO';
  linhasVendaRecebidas: number;
  linhasVendaIgnoradasNaoPositivas: number;
  linhasVendaUsandoAliasAmbiguoS: number;
  gruposClientePartNumber: number;
  linhasVendaDuplicatasExatasRemovidas: number;
  linhasVendaAgregadasPorDuplicidade: number;
  clientesUfRecebidos: number;
  clientesUfDuplicatasExatasRemovidas: number;
  linhasComIdentificacaoFilial: number;
  linhasFleetRecebidas: number;
  fleetDuplicatasExatasRemovidas: number;
  registrosPositivos: number;
  quantidadePositiva: number;
  registrosDistribuidos: number;
  quantidadeDistribuida: number;
  registrosExcecao: number;
  quantidadeNaoDistribuida: number;
  linhasDistribuicaoUf: number;
  linhasDistribuicaoFilial: number;
  geradoEm: string;
}

export interface FilialBreakdown {
  filial: string;
  qtdFinalFilial: number;
}

export interface ClienteUfBreakdown {
  cliente: string;
  uf: string;
  filiaisUf: number;
  qtdFinalUf: number;
  qtdBasePorFilialEstimada: number;
  filiaisComMais1Estimado: number;
  estimada: boolean;
  filiais: FilialBreakdown[];
}

export interface DashboardPayload {
  erro: string | null;
  atualizadoEm: string | null;
  geradoEm?: string;
  totalLinhas: number;
  filtros: {
    ufs: string[];
    clientes: string[];
    partNumbers: string[];
    familias: string[];
  };
  totaisPorUf: Record<string, number>;
  totaisRealVsDirecionadoPorUf: Record<string, { real: number; direcionada: number }>;
  totalRealVsDirecionado: { real: number; direcionada: number };
  linhas: DistributionRow[];
  distribuicaoPorFilial: ClienteUfBreakdown[];
  excecoes: ExceptionRow[];
  resumoExecucao: ResumoExecucao | null;
}

declare global {
  interface Window {
    __N8N_PAYLOAD__?: DashboardPayload;
  }
}
