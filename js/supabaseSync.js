/* ======================================================================
   supabaseSync.js — sincroniza o modelo de dados local (localStorage,
   ver js/db.js) com as tabelas do Supabase (contas, categorias, meses,
   lancamentos).

   Funciona como espelho em segundo plano: o app continua lendo/gravando
   em localStorage normalmente (rápido, síncrono); a cada `salvar()` os
   dados também são enviados ao Supabase, e num navegador novo (sem nada
   em localStorage ainda) os dados atuais são buscados do Supabase antes
   da primeira renderização. Se o Supabase estiver indisponível (sem
   internet, chave inválida etc.), tudo é ignorado silenciosamente e o
   app segue funcionando só com localStorage.
====================================================================== */

const SupabaseSync = (() => {

  function ativo() {
    return !!supabaseClient;
  }

  async function buscarDadosAtuais() {
    if (!ativo()) return null;
    try {
      const [rContas, rCategorias, rMeses, rLancamentos] = await Promise.all([
        supabaseClient.from('contas').select('*'),
        supabaseClient.from('categorias').select('*'),
        supabaseClient.from('meses').select('*'),
        supabaseClient.from('lancamentos').select('*'),
      ]);
      const erro = rContas.error || rCategorias.error || rMeses.error || rLancamentos.error;
      if (erro) throw erro;

      const dbRemoto = {
        versao: 1,
        contas: (rContas.data || []).map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
        categorias: (rCategorias.data || []).map(c => ({ id: c.id, nome: c.nome, cor: c.cor, palavras: c.palavras || [] })),
        meses: {},
      };

      for (const m of (rMeses.data || [])) {
        dbRemoto.meses[m.id] = {
          saldoInicial: Number(m.saldo_inicial) || 0,
          saldoFinalInformado: m.saldo_final_informado === null ? null : Number(m.saldo_final_informado),
          lancamentos: [],
        };
      }
      for (const l of (rLancamentos.data || [])) {
        if (!dbRemoto.meses[l.mes_id]) {
          dbRemoto.meses[l.mes_id] = { saldoInicial: 0, saldoFinalInformado: null, lancamentos: [] };
        }
        dbRemoto.meses[l.mes_id].lancamentos.push({
          id: l.id,
          data: l.data,
          descricao: l.descricao,
          valor: Number(l.valor),
          tipo: l.tipo,
          categoriaId: l.categoria_id,
          contaId: l.conta_id,
          origem: l.origem,
          criadoEm: l.criado_em,
        });
      }

      // banco remoto sem nenhum dado ainda (ex: tabelas recém-criadas e
      // esvaziadas) -> deixa o app usar o estado vazio padrão local
      if (!dbRemoto.contas.length && !dbRemoto.categorias.length) return null;

      return dbRemoto;
    } catch (e) {
      console.warn('Supabase indisponível ao buscar dados atuais, usando apenas dados locais.', e);
      return null;
    }
  }

  async function sincronizar(db) {
    if (!ativo()) return;
    try {
      if (db.contas.length) {
        await supabaseClient.from('contas')
          .upsert(db.contas.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo })));
      }
      if (db.categorias.length) {
        await supabaseClient.from('categorias')
          .upsert(db.categorias.map(c => ({ id: c.id, nome: c.nome, cor: c.cor, palavras: c.palavras || [] })));
      }

      const idsMeses = Object.keys(db.meses);
      if (idsMeses.length) {
        await supabaseClient.from('meses').upsert(idsMeses.map(id => ({
          id,
          saldo_inicial: db.meses[id].saldoInicial || 0,
          saldo_final_informado: db.meses[id].saldoFinalInformado ?? null,
        })));
      }

      const todosLancamentos = [];
      for (const mesId of idsMeses) {
        for (const l of (db.meses[mesId].lancamentos || [])) {
          todosLancamentos.push({
            id: l.id,
            mes_id: mesId,
            data: l.data,
            descricao: l.descricao,
            valor: l.valor,
            tipo: l.tipo,
            categoria_id: l.categoriaId,
            conta_id: l.contaId,
            origem: l.origem,
            criado_em: l.criadoEm,
          });
        }
      }
      if (todosLancamentos.length) {
        await supabaseClient.from('lancamentos').upsert(todosLancamentos);
      }
    } catch (e) {
      console.warn('Falha ao sincronizar com Supabase (dados locais preservados).', e);
    }
  }

  return { ativo, buscarDadosAtuais, sincronizar };
})();
