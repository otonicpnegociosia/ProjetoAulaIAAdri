/* ======================================================================
   csvImport.js — leitura simples de CSV (separador , ou ;) e sugestão
   de mapeamento de colunas.
====================================================================== */

const CsvImport = (() => {

  function detectarSeparador(linha) {
    const qtdVirgula = (linha.match(/,/g) || []).length;
    const qtdPontoVirgula = (linha.match(/;/g) || []).length;
    return qtdPontoVirgula > qtdVirgula ? ';' : ',';
  }

  function parseLinhaCSV(linha, sep) {
    // parser simples que respeita aspas
    const campos = [];
    let atual = '';
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') {
        dentroAspas = !dentroAspas;
      } else if (ch === sep && !dentroAspas) {
        campos.push(atual.trim());
        atual = '';
      } else {
        atual += ch;
      }
    }
    campos.push(atual.trim());
    return campos.map(c => c.replace(/^"|"$/g, ''));
  }

  function parse(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (linhas.length === 0) return { cabecalho: [], linhas: [] };
    const sep = detectarSeparador(linhas[0]);
    const cabecalho = parseLinhaCSV(linhas[0], sep);
    const dados = linhas.slice(1).map(l => parseLinhaCSV(l, sep));
    return { cabecalho, linhas: dados };
  }

  function adivinharColuna(cabecalho, candidatos) {
    const norm = cabecalho.map(h => normalizarTexto(h));
    for (const c of candidatos) {
      const idx = norm.findIndex(h => h.includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function sugerirMapeamento(cabecalho) {
    return {
      data: adivinharColuna(cabecalho, ['data', 'date']),
      descricao: adivinharColuna(cabecalho, ['descri', 'historico', 'lancamento', 'title', 'memo']),
      valor: adivinharColuna(cabecalho, ['valor', 'amount', 'montante']),
    };
  }

  return { parse, sugerirMapeamento };
})();
