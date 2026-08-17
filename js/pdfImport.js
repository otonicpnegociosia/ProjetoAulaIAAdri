/* ======================================================================
   pdfImport.js — extração de texto de PDF (pdf.js) e parser heurístico
   de lançamentos para extrato bancário e fatura de cartão.

   ATENÇÃO: bancos e operadoras usam layouts muito diferentes. O parser
   abaixo foi calibrado com extratos/faturas reais em formato tabular
   (Data | Histórico | Tipo de lançamento | CNPJ/CPF | Valor | Saldo, e
   Data | Estabelecimento | MCC | Ramo | Cidade | Valor), mas continua
   funcionando de forma genérica para variações desse layout. Ele é
   propositalmente conservador: tudo que reconhece cai em uma grade de
   REVISÃO onde você confirma/edita antes de importar de fato — nada é
   gravado sem sua confirmação.
====================================================================== */

const PdfImport = (() => {

  const PALAVRAS_IGNORAR_LINHA = [
    'saldo anterior', 'saldo atual', 'saldo do dia', 'saldo disponivel', 'saldo final',
    'total de credito', 'total de debito', 'subtotal', 'pagina', 'periodo:',
    'cnpj', 'agencia:', 'conta corrente n', 'ouvidoria', 'sac ', 'central de atendimento',
    'lancamentos futuros', 'limite de credito', 'limite total', 'limite utilizado', 'limite disponivel',
    'vencimento fatura anterior', 'vencimento:', 'fechamento:', 'emitido em', 'titular:',
    'resumo do periodo', 'resumo da fatura', 'saldo da fatura anterior', 'pagamento recebido em',
    'total desta fatura', 'compras do periodo', 'pagamento minimo', 'como classificar',
    'documento ficticio', 'total das compras',
  ];

  // linha começa com uma data (dd/mm ou dd/mm/aaaa) — é assim que uma
  // linha de lançamento de verdade começa nesses documentos.
  const DATA_INICIO_RE = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\b/;

  const KEYWORDS_RECEITA = ['pix recebido', 'deposito', 'salario', 'transferencia recebida', 'estorno', 'resgate', 'ted recebida', 'doc recebido', 'rendimento', 'credito ted'];
  const KEYWORDS_DESPESA = ['pix enviado', 'pagamento', 'compra', 'saque', 'tarifa', 'ted enviada', 'doc enviado', 'boleto', 'debito', 'anuidade', 'juros', 'iof'];

  // valores de "Tipo de lançamento" comumente usados por extratos bancários —
  // quando a linha termina com um desses, ele é retirado da descrição (fica
  // numa coluna própria na fatura original) e usado como pista extra do tipo.
  const TIPOS_LANCAMENTO_CONHECIDOS = [
    'PIX ENVIADO', 'PIX RECEBIDO', 'DEBITO AUTOMATICO', 'DEB AUTOMATICO',
    'COMPRA NO DEBITO', 'COMPRA DEBITO', 'CREDITO TED', 'TED RECEBIDA', 'TED ENVIADA',
    'PAGAMENTO FATURA', 'PAGTO FATURA', 'DOC RECEBIDO', 'DOC ENVIADO',
    'SAQUE', 'TARIFA', 'RENDIMENTO', 'BOLETO',
  ].sort((a, b) => b.length - a.length); // mais específicos primeiro

  // CNPJ (00.000.000/0000-00), CPF mascarado (***.000.000-**) ou "-" (sem favorecido)
  const FAVORECIDO_FINAL_RE = /\s+(?:CPF\s+)?(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\*{3}\.\d{3}\.\d{3}-\*{2}|-)\s*$/i;

  // código MCC (Merchant Category Code) -> categoria padrão sugerida.
  // é o jeito mais confiável de categorizar fatura de cartão: o nome do
  // estabelecimento varia, o MCC é padronizado pela bandeira.
  const MCC_CATEGORIA = {
    '5811': 'alimentacao', '5812': 'alimentacao', '5462': 'alimentacao', '5411': 'alimentacao',
    '5541': 'transporte', '5542': 'transporte', '4121': 'transporte', '4111': 'transporte',
    '5912': 'saude', '8011': 'saude', '8021': 'saude', '8062': 'saude', '8099': 'saude',
    '4899': 'lazer', '5735': 'lazer', '7832': 'lazer', '7011': 'lazer', '7922': 'lazer',
    '5942': 'educacao', '8220': 'educacao', '8299': 'educacao',
    '5999': 'compras', '5722': 'compras', '5655': 'compras', '5311': 'compras', '5651': 'compras', '5732': 'compras',
  };

  async function garantirWorker() {
    if (!window.pdfjsLib) throw new Error('Biblioteca pdf.js não carregada (verifique sua conexão com a internet).');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
  }

  /** Extrai linhas de texto do PDF, reagrupando itens por posição Y (linha visual). */
  async function extrairLinhas(file) {
    await garantirWorker();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const linhas = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const porY = new Map();

      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        // agrupa itens cuja posição Y esteja próxima (tolerância de 2px)
        let chave = y;
        for (const k of porY.keys()) {
          if (Math.abs(k - y) <= 2) { chave = k; break; }
        }
        if (!porY.has(chave)) porY.set(chave, []);
        porY.get(chave).push({ x: item.transform[4], str: item.str });
      }

      const linhasPagina = Array.from(porY.entries())
        .sort((a, b) => b[0] - a[0]) // maior Y primeiro (topo -> base)
        .map(([, itens]) => itens.sort((a, b) => a.x - b.x).map(i => i.str).join(' ').replace(/\s{2,}/g, ' ').trim())
        .filter(Boolean);

      linhas.push(...linhasPagina);
    }
    return linhas;
  }

  function normalizarData(str, anoRef) {
    const partes = str.split('/');
    let [dia, mes, ano] = partes;
    if (!ano) {
      ano = String(anoRef);
    } else if (ano.length === 2) {
      ano = '20' + ano;
    }
    dia = dia.padStart(2, '0');
    mes = mes.padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function deveIgnorarLinha(linhaLower) {
    return PALAVRAS_IGNORAR_LINHA.some(p => linhaLower.includes(p));
  }

  function isNumeroMoeda(token) {
    return /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(token);
  }

  /**
   * Lê os tokens finais da linha (da direita pra esquerda) e separa o
   * sufixo D/C (se houver) dos números em formato moeda. Extratos com
   * coluna de saldo corrente têm DOIS números no final (valor + saldo);
   * o valor do lançamento é o penúltimo, não o último.
   */
  function extrairValorFinal(tokens) {
    let i = tokens.length - 1;
    let sufixo = '';
    if (i >= 0 && /^(D|C|CR|DB)$/i.test(tokens[i])) {
      sufixo = tokens[i].toUpperCase();
      i--;
    }
    const numericos = [];
    while (i >= 0 && isNumeroMoeda(tokens[i])) {
      numericos.unshift(tokens[i]);
      i--;
    }
    if (numericos.length === 0) return null;
    const valorToken = numericos.length >= 2 ? numericos[numericos.length - 2] : numericos[0];
    return { fimDescricaoIdx: i, valorToken, sufixo };
  }

  function sugerirTipo(contextoLower, sinalExplicito, sufixo) {
    if (sinalExplicito === '-') return 'despesa';
    if (sufixo === 'D' || sufixo === 'DB') return 'despesa';
    if (sufixo === 'C' || sufixo === 'CR') return 'receita';

    if (KEYWORDS_RECEITA.some(k => contextoLower.includes(k))) return 'receita';
    if (KEYWORDS_DESPESA.some(k => contextoLower.includes(k))) return 'despesa';

    // sem sinal explícito e sem palavra-chave: fatura de cartão é quase
    // sempre despesa; extrato sem nenhuma pista também tende a ser despesa
    // (fica marcado com baixa confiança para revisão manual)
    return 'despesa';
  }

  /**
   * Converte as linhas de texto extraídas em lançamentos candidatos.
   * @param {string[]} linhas
   * @param {'extrato'|'fatura'} tipoDocumento
   * @param {{ano:number, mes:number}} referencia usado quando a data não tem ano
   */
  function parseLancamentos(linhas, tipoDocumento, referencia) {
    const candidatos = [];

    for (const linhaOriginal of linhas) {
      const linha = linhaOriginal.trim();
      const linhaLower = normalizarTexto(linha);
      if (linha.length < 6) continue;
      if (deveIgnorarLinha(linhaLower)) continue;

      const dataMatch = linha.match(DATA_INICIO_RE);
      if (!dataMatch) continue; // linha de lançamento sempre começa com a data

      const tokens = linha.split(/\s+/);
      const info = extrairValorFinal(tokens);
      if (!info) continue;

      const valorNum = DB.parseBRLInput(info.valorToken);
      if (!valorNum) continue;

      let descricao = tokens.slice(1, info.fimDescricaoIdx + 1).join(' ').trim();
      if (descricao.length < 2) continue;

      let tipoLancamentoDetectado = '';
      let categoriaSugerida = null;

      if (tipoDocumento === 'extrato') {
        // remove o favorecido (CNPJ/CPF/"-") do final da descrição
        descricao = descricao.replace(FAVORECIDO_FINAL_RE, '').trim();
        // remove o "tipo de lançamento" (PIX ENVIADO, DEB AUTOMATICO...) do final
        const descUpper = descricao.toUpperCase();
        for (const tipoTxt of TIPOS_LANCAMENTO_CONHECIDOS) {
          if (descUpper.endsWith(tipoTxt)) {
            descricao = descricao.slice(0, descricao.length - tipoTxt.length).trim();
            tipoLancamentoDetectado = tipoTxt;
            break;
          }
        }
      } else if (tipoDocumento === 'fatura') {
        // procura um código MCC conhecido dentro da descrição; tudo antes
        // dele é o nome do estabelecimento, tudo depois (ramo/cidade) descarta
        const partes = descricao.split(/\s+/);
        for (let k = 0; k < partes.length; k++) {
          if (MCC_CATEGORIA[partes[k]]) {
            categoriaSugerida = MCC_CATEGORIA[partes[k]];
            descricao = partes.slice(0, k).join(' ').trim();
            break;
          }
        }
      }

      if (descricao.length < 2) continue;

      const contextoLower = normalizarTexto(descricao + ' ' + tipoLancamentoDetectado);
      const sinalExplicito = info.valorToken.startsWith('-') ? '-' : '';
      const sufixo = info.sufixo;

      const confiancaBaixa = !sinalExplicito && !sufixo && !tipoLancamentoDetectado &&
        !KEYWORDS_RECEITA.some(k => contextoLower.includes(k)) &&
        !KEYWORDS_DESPESA.some(k => contextoLower.includes(k));

      let tipoSugerido = sugerirTipo(contextoLower, sinalExplicito, sufixo);
      if (tipoDocumento === 'fatura' && (contextoLower.includes('pagamento') || contextoLower.includes('estorno'))) {
        tipoSugerido = contextoLower.includes('estorno') ? 'receita' : 'transferencia';
      }
      // pagamento de fatura no extrato é uma transferência entre contas próprias,
      // não uma despesa nova (as despesas já entram individualmente pela fatura) —
      // evita contar o mesmo gasto duas vezes quando extrato e fatura são importados juntos.
      if (contextoLower.includes('pagamento de fatura') || contextoLower.includes('pagto fatura') ||
          contextoLower.includes('pagto de fatura') || contextoLower.includes('pagamento fatura')) {
        tipoSugerido = 'transferencia';
      }
      // dinheiro movido para uma conta/aplicação própria também não é despesa —
      // continua seu, só mudou de lugar.
      if (contextoLower.includes('conta investimento') || contextoLower.includes('aplicacao financeira')) {
        tipoSugerido = 'transferencia';
      }

      const dataISO = normalizarData(dataMatch[1], referencia.ano, referencia.mes);

      candidatos.push({
        data: dataISO,
        descricao,
        valor: Math.abs(valorNum),
        tipoSugerido,
        categoriaSugerida,
        confiancaBaixa,
        linhaOriginal: linha,
      });
    }
    return candidatos;
  }

  return { extrairLinhas, parseLancamentos };
})();
