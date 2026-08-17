/* ======================================================================
   db.js — camada de persistência (localStorage) do Assistente Financeiro
   Estrutura dos dados:
   {
     versao: 1,
     contas: [{id, nome, tipo}],
     categorias: [{id, nome, cor, palavras: []}],
     meses: {
       "2026-07": {
         saldoInicial: 0,
         saldoFinalInformado: null,
         lancamentos: [
           {
             id, data: "2026-07-05", descricao, valor: 120.5,
             tipo: "receita"|"despesa"|"transferencia",
             categoriaId, contaId, origem: "manual"|"pdf:extrato"|"pdf:fatura"|"csv",
             criadoEm
           }
         ]
       }
     }
   }
====================================================================== */

const STORAGE_KEY = 'assistenteFinanceiro:v1';

const DB = (() => {

  function contasPadrao() {
    return [
      { id: 'conta-corrente', nome: 'Conta Corrente', tipo: 'corrente' },
      { id: 'cartao-credito', nome: 'Cartão de Crédito', tipo: 'cartao' },
    ];
  }

  function estadoVazio() {
    return {
      versao: 1,
      contas: contasPadrao(),
      categorias: CATEGORIAS_PADRAO.map(c => ({ ...c, palavras: [...c.palavras] })),
      meses: {},
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return estadoVazio();
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.meses || !parsed.categorias || !parsed.contas) return estadoVazio();
      return parsed;
    } catch (e) {
      console.error('Falha ao ler banco local, iniciando vazio.', e);
      return estadoVazio();
    }
  }

  function save(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function mesId(date) {
    // date: objeto Date -> "YYYY-MM"
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function getMes(db, id) {
    if (!db.meses[id]) {
      db.meses[id] = { saldoInicial: 0, saldoFinalInformado: null, lancamentos: [] };
    }
    return db.meses[id];
  }

  function listMesesComDados(db) {
    return Object.keys(db.meses)
      .filter(k => (db.meses[k].lancamentos || []).length > 0)
      .sort();
  }

  function novoId() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function isDuplicado(mes, lanc) {
    return (mes.lancamentos || []).some(l =>
      l.data === lanc.data &&
      Math.abs(l.valor - lanc.valor) < 0.005 &&
      l.descricao.trim().toLowerCase() === lanc.descricao.trim().toLowerCase()
    );
  }

  function totaisDoMes(mes) {
    let receitas = 0, despesas = 0, transferencias = 0;
    const porCategoria = {};
    const porConta = {};
    for (const l of (mes.lancamentos || [])) {
      const valorAbs = Math.abs(l.valor);
      if (l.tipo === 'receita') receitas += valorAbs;
      else if (l.tipo === 'despesa') despesas += valorAbs;
      else transferencias += valorAbs;

      if (l.tipo === 'despesa') {
        porCategoria[l.categoriaId] = (porCategoria[l.categoriaId] || 0) + valorAbs;
      }
      porConta[l.contaId] = (porConta[l.contaId] || 0) + (l.tipo === 'despesa' ? -valorAbs : (l.tipo === 'receita' ? valorAbs : 0));
    }
    return {
      receitas, despesas, transferencias,
      saldo: receitas - despesas,
      porCategoria, porConta,
    };
  }

  function formatBRL(valor) {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parseBRLInput(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    let s = String(str).trim();
    s = s.replace(/[^\d,.\-]/g, '');
    // heurística: se tem vírgula, ela é o separador decimal (formato BR)
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const v = parseFloat(s);
    return isNaN(v) ? 0 : v;
  }

  function nomeMes(id) {
    const [y, m] = id.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    const nome = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  function exportJSON(db) {
    return JSON.stringify(db, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed.meses || !parsed.categorias || !parsed.contas) {
      throw new Error('Arquivo de backup inválido.');
    }
    return parsed;
  }

  return {
    load, save, mesId, getMes, listMesesComDados, novoId, isDuplicado,
    totaisDoMes, formatBRL, parseBRLInput, nomeMes, exportJSON, importJSON,
    estadoVazio,
  };
})();
