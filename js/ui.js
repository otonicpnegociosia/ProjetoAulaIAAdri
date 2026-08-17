/* ======================================================================
   ui.js — controlador da interface: abas, dashboard, lançamentos,
   importação (PDF/CSV) e configurações.
====================================================================== */

(() => {
  let db = DB.load();
  let mesAtual = DB.mesId(new Date());
  let reviewPendentes = []; // lançamentos candidatos aguardando confirmação de import
  let editandoId = null; // id do lançamento em edição no modal

  // ---------- utilidades de DOM ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function salvar() { DB.save(db); }

  function toast(msg, tipo = 'info') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  // ---------- abas principais ----------
  function initTabs() {
    $$('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.tab').forEach(b => b.classList.remove('active'));
        $$('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $(`#tab-${btn.dataset.tab}`).classList.add('active');
        if (btn.dataset.tab === 'lancamentos') renderTabelaLancamentos();
        if (btn.dataset.tab === 'categorias') renderCategorias();
        if (btn.dataset.tab === 'config') renderConfig();
        if (btn.dataset.tab === 'importar') renderSelectsImport();
      });
    });
  }

  // ---------- seletor de mês ----------
  function initMonthPicker() {
    const picker = $('#monthPicker');
    picker.value = mesAtual;
    picker.addEventListener('change', () => {
      if (picker.value) { mesAtual = picker.value; renderTudo(); }
    });
    $('#prevMonth').addEventListener('click', () => mudarMes(-1));
    $('#nextMonth').addEventListener('click', () => mudarMes(1));
  }

  function mudarMes(delta) {
    const [y, m] = mesAtual.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    mesAtual = DB.mesId(d);
    $('#monthPicker').value = mesAtual;
    renderTudo();
  }

  // ---------- dashboard ----------
  function renderDashboard() {
    const mes = DB.getMes(db, mesAtual);
    const totais = DB.totaisDoMes(mes);

    $('#kpiReceitas').textContent = DB.formatBRL(totais.receitas);
    $('#kpiDespesas').textContent = DB.formatBRL(totais.despesas);
    $('#kpiSaldo').textContent = DB.formatBRL(totais.saldo);
    $('#kpiSaldo').closest('.kpi-card').classList.toggle('negativo', totais.saldo < 0);

    const cartao = db.contas.find(c => c.tipo === 'cartao');
    const totalCartao = cartao
      ? (mes.lancamentos || []).filter(l => l.contaId === cartao.id && l.tipo === 'despesa').reduce((a, l) => a + l.valor, 0)
      : 0;
    $('#kpiFatura').textContent = DB.formatBRL(totalCartao);

    const vazio = (mes.lancamentos || []).length === 0;
    $('#dashboardEmptyState').hidden = !vazio;
    $('.charts-grid').style.display = vazio ? 'none' : '';
    $('.reconciliacao').style.display = vazio ? 'none' : '';

    if (!vazio) {
      // gráficos dependem do Chart.js (CDN); se a lib não carregar (ex: sem
      // internet), isso não pode travar o resto do dashboard/app.
      try {
        if (typeof Chart === 'undefined') throw new Error('Biblioteca de gráficos (Chart.js) não carregada — verifique sua conexão com a internet.');
        const temCategorias = Charts.renderCategorias($('#chartCategorias'), totais.porCategoria, db.categorias);
        $('#legendCategoriasVazio').hidden = temCategorias;
        Charts.renderContas($('#chartContas'), totais.porConta, db.contas);

        const historico = ultimosMeses(6).map(id => {
          const m = DB.getMes(db, id);
          const t = DB.totaisDoMes(m);
          return { label: DB.nomeMes(id).split(' ')[0].slice(0, 3) + '/' + id.slice(2, 4), receitas: t.receitas, despesas: t.despesas };
        });
        Charts.renderEvolucao($('#chartEvolucao'), historico);
      } catch (err) {
        console.warn('Falha ao renderizar gráficos:', err);
        $('.charts-grid').innerHTML = `<div class="card"><p class="hint">⚠️ Não foi possível carregar os gráficos (${escapeHtml(err.message)}). Os totais e a lista de lançamentos continuam funcionando normalmente.</p></div>`;
      }

      $('#saldoInicial').value = mes.saldoInicial ? mes.saldoInicial.toFixed(2).replace('.', ',') : '';
      $('#saldoFinalInformado').value = mes.saldoFinalInformado != null ? mes.saldoFinalInformado.toFixed(2).replace('.', ',') : '';
      atualizarReconciliacao(mes, totais);
    }
  }

  function ultimosMeses(qtd) {
    const [y, m] = mesAtual.split('-').map(Number);
    const lista = [];
    for (let i = qtd - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      lista.push(DB.mesId(d));
    }
    return lista;
  }

  function atualizarReconciliacao(mes, totais) {
    const status = $('#reconcStatus');
    if (mes.saldoFinalInformado == null || mes.saldoFinalInformado === '') {
      status.textContent = 'Informe o saldo final do extrato para conferir automaticamente.';
      status.className = '';
      return;
    }
    const calculado = (mes.saldoInicial || 0) + totais.saldo;
    const diferenca = mes.saldoFinalInformado - calculado;
    if (Math.abs(diferenca) < 0.01) {
      status.textContent = `✅ Confere! Saldo calculado: ${DB.formatBRL(calculado)}`;
      status.className = 'ok';
    } else {
      status.textContent = `⚠️ Diferença de ${DB.formatBRL(diferenca)} — pode haver lançamentos faltando (calculado: ${DB.formatBRL(calculado)})`;
      status.className = 'alerta';
    }
  }

  function initReconciliacao() {
    $('#saldoInicial').addEventListener('change', (e) => {
      const mes = DB.getMes(db, mesAtual);
      mes.saldoInicial = DB.parseBRLInput(e.target.value);
      salvar();
      renderDashboard();
    });
    $('#saldoFinalInformado').addEventListener('change', (e) => {
      const mes = DB.getMes(db, mesAtual);
      mes.saldoFinalInformado = e.target.value ? DB.parseBRLInput(e.target.value) : null;
      salvar();
      renderDashboard();
    });
  }

  // ---------- lançamentos (tabela + modal) ----------
  function popularSelectsCategoria(select, selecionado) {
    select.innerHTML = db.categorias.map(c => `<option value="${c.id}" ${c.id === selecionado ? 'selected' : ''}>${c.nome}</option>`).join('');
  }
  function popularSelectsConta(select, selecionado) {
    select.innerHTML = db.contas.map(c => `<option value="${c.id}" ${c.id === selecionado ? 'selected' : ''}>${c.nome}</option>`).join('');
  }

  function renderFiltrosLancamentos() {
    const fc = $('#filtroCategoria');
    fc.innerHTML = '<option value="">Todas categorias</option>' + db.categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    const fa = $('#filtroConta');
    fa.innerHTML = '<option value="">Todas contas</option>' + db.contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  }

  function renderTabelaLancamentos() {
    const mes = DB.getMes(db, mesAtual);
    const busca = normalizarTexto($('#buscaLanc').value);
    const fCategoria = $('#filtroCategoria').value;
    const fConta = $('#filtroConta').value;
    const fTipo = $('#filtroTipo').value;

    const linhas = (mes.lancamentos || [])
      .filter(l => !busca || normalizarTexto(l.descricao).includes(busca))
      .filter(l => !fCategoria || l.categoriaId === fCategoria)
      .filter(l => !fConta || l.contaId === fConta)
      .filter(l => !fTipo || l.tipo === fTipo)
      .sort((a, b) => b.data.localeCompare(a.data));

    const tbody = $('#tabelaLancamentos tbody');
    if (linhas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="tabela-vazia">Nenhum lançamento encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = linhas.map(l => `
      <tr data-id="${l.id}">
        <td>${formatarDataBR(l.data)}</td>
        <td>${escapeHtml(l.descricao)}</td>
        <td><span class="tag-cor" style="background:${corCategoria(db.categorias, l.categoriaId)}"></span>${nomeCategoria(db.categorias, l.categoriaId)}</td>
        <td>${escapeHtml(db.contas.find(c => c.id === l.contaId)?.nome || '—')}</td>
        <td><span class="badge badge-${l.tipo}">${rotuloTipo(l.tipo)}</span></td>
        <td class="valor-${l.tipo}">${DB.formatBRL(l.valor)}</td>
        <td class="origem">${rotuloOrigem(l.origem)}</td>
        <td class="acoes">
          <button class="icon-btn" data-acao="editar" title="Editar">✏️</button>
          <button class="icon-btn" data-acao="excluir" title="Excluir">🗑️</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-acao]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('tr').dataset.id;
        if (btn.dataset.acao === 'editar') abrirModalLancamento(id);
        else excluirLancamento(id);
      });
    });
  }

  function rotuloTipo(tipo) {
    return { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' }[tipo] || tipo;
  }
  function rotuloOrigem(origem) {
    return { manual: 'Manual', 'pdf:extrato': 'PDF Extrato', 'pdf:fatura': 'PDF Fatura', csv: 'CSV' }[origem] || origem;
  }
  function formatarDataBR(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function excluirLancamento(id) {
    const mes = DB.getMes(db, mesAtual);
    mes.lancamentos = mes.lancamentos.filter(l => l.id !== id);
    salvar();
    renderTudo();
    toast('Lançamento excluído.');
  }

  function abrirModalLancamento(id) {
    editandoId = id || null;
    const modal = $('#modalLancamento');
    const form = $('#formLancamento');
    form.reset();
    popularSelectsCategoria($('#campoCategoria'));
    popularSelectsConta($('#campoConta'));

    if (id) {
      const mes = DB.getMes(db, mesAtual);
      const l = mes.lancamentos.find(x => x.id === id);
      $('#modalTitulo').textContent = 'Editar lançamento';
      $('#campoData').value = l.data;
      $('#campoDescricao').value = l.descricao;
      $('#campoValor').value = l.valor.toFixed(2).replace('.', ',');
      $('#campoTipo').value = l.tipo;
      $('#campoCategoria').value = l.categoriaId;
      $('#campoConta').value = l.contaId;
    } else {
      $('#modalTitulo').textContent = 'Novo lançamento';
      $('#campoData').value = mesAtual + '-01';
      $('#campoTipo').value = 'despesa';
    }
    modal.showModal();
  }

  function initModalLancamento() {
    $('#btnNovoLancamento').addEventListener('click', () => abrirModalLancamento(null));
    $('#btnFecharModal').addEventListener('click', () => $('#modalLancamento').close());
    $('#campoDescricao').addEventListener('blur', (e) => {
      if (!$('#campoCategoria').dataset.tocado) {
        $('#campoCategoria').value = sugerirCategoria(e.target.value, db.categorias);
      }
    });
    $('#campoCategoria').addEventListener('change', (e) => e.target.dataset.tocado = '1');

    $('#formLancamento').addEventListener('submit', (e) => {
      e.preventDefault();
      const dataVal = $('#campoData').value;
      const lanc = {
        id: editandoId || DB.novoId(),
        data: dataVal,
        descricao: $('#campoDescricao').value.trim(),
        valor: Math.abs(DB.parseBRLInput($('#campoValor').value)),
        tipo: $('#campoTipo').value,
        categoriaId: $('#campoCategoria').value,
        contaId: $('#campoConta').value,
        origem: editandoId ? undefined : 'manual',
        criadoEm: editandoId ? undefined : new Date().toISOString(),
      };
      if (!lanc.descricao || !lanc.valor || !dataVal) {
        toast('Preencha data, descrição e valor.', 'erro');
        return;
      }
      const mesDoLancamento = dataVal.slice(0, 7);
      const mesObj = DB.getMes(db, mesDoLancamento);

      if (editandoId) {
        const mesAtualObj = DB.getMes(db, mesAtual);
        const idx = mesAtualObj.lancamentos.findIndex(x => x.id === editandoId);
        const original = mesAtualObj.lancamentos[idx];
        const atualizado = { ...original, ...lanc, origem: original.origem, criadoEm: original.criadoEm };
        if (mesDoLancamento !== mesAtual) {
          mesAtualObj.lancamentos.splice(idx, 1);
          mesObj.lancamentos.push(atualizado);
        } else {
          mesAtualObj.lancamentos[idx] = atualizado;
        }
      } else {
        mesObj.lancamentos.push(lanc);
      }
      salvar();
      $('#modalLancamento').close();
      if (mesDoLancamento !== mesAtual) {
        mesAtual = mesDoLancamento;
        $('#monthPicker').value = mesAtual;
      }
      renderTudo();
      toast('Lançamento salvo com sucesso.', 'sucesso');
    });
  }

  function initFiltrosLancamentos() {
    ['#buscaLanc', '#filtroCategoria', '#filtroConta', '#filtroTipo'].forEach(sel => {
      $(sel).addEventListener('input', renderTabelaLancamentos);
    });
  }

  // ---------- importação ----------
  function renderSelectsImport() {
    popularSelectsConta($('#contaDestinoPdf'));
    $('#contaDestinoPdf').value = 'conta-corrente';
    popularSelectsConta($('#contaDestinoCsv'));
  }

  function initImportTabs() {
    $$('.import-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.import-tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('#importPdfPanel').hidden = btn.dataset.import !== 'pdf';
        $('#importCsvPanel').hidden = btn.dataset.import !== 'csv';
        $('#reviewPanel').hidden = true;
      });
    });

    $('#tipoDocumentoPdf').addEventListener('change', (e) => {
      $('#contaDestinoPdf').value = e.target.value === 'fatura' ? 'cartao-credito' : 'conta-corrente';
    });
  }

  function initDropzones() {
    setupDropzone($('#dropzonePdf'), $('#filePdf'), processarPdf);
    setupDropzone($('#dropzoneCsv'), $('#fileCsv'), processarCsvArquivo);
  }

  function setupDropzone(zone, input, onFile) {
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
    ['dragover', 'dragleave', 'drop'].forEach(evt => {
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.toggle('dragover', evt === 'dragover');
      });
    });
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
  }

  async function processarPdf(file) {
    const status = $('#pdfStatus');
    status.textContent = 'Lendo PDF...';
    try {
      const linhas = await PdfImport.extrairLinhas(file);
      if (linhas.length < 3) {
        status.textContent = '⚠️ Não foi possível extrair texto suficiente. O PDF pode ser uma imagem digitalizada — nesse caso, use lançamento manual ou exporte um CSV do seu banco.';
        return;
      }
      const [ano, mes] = mesAtual.split('-').map(Number);
      const tipoDocumento = $('#tipoDocumentoPdf').value;
      const contaId = $('#contaDestinoPdf').value;
      const candidatos = PdfImport.parseLancamentos(linhas, tipoDocumento, { ano, mes });

      if (candidatos.length === 0) {
        status.textContent = '⚠️ Nenhum lançamento reconhecido automaticamente neste PDF. Você pode adicioná-los manualmente na aba "Lançamentos".';
        return;
      }
      status.textContent = `${candidatos.length} lançamento(s) encontrado(s) — revise abaixo antes de importar.`;
      abrirRevisao(candidatos, contaId, `pdf:${tipoDocumento}`);
    } catch (err) {
      console.error(err);
      status.textContent = '❌ Erro ao processar o PDF: ' + err.message;
    }
  }

  function processarCsvArquivo(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const { cabecalho, linhas } = CsvImport.parse(reader.result);
      if (linhas.length === 0) { toast('CSV vazio ou inválido.', 'erro'); return; }
      const sugestao = CsvImport.sugerirMapeamento(cabecalho);
      $('#csvMapping').hidden = false;
      ['mapData', 'mapDescricao', 'mapValor'].forEach((id, i) => {
        const key = ['data', 'descricao', 'valor'][i];
        const sel = $('#' + id);
        sel.innerHTML = cabecalho.map((h, idx) => `<option value="${idx}">${escapeHtml(h)}</option>`).join('');
        if (sugestao[key] >= 0) sel.value = sugestao[key];
      });
      $('#btnPrepararPreviewCsv').onclick = () => prepararPreviewCsv(cabecalho, linhas);
    };
    reader.readAsText(file, 'utf-8');
  }

  function prepararPreviewCsv(cabecalho, linhas) {
    const idxData = parseInt($('#mapData').value);
    const idxDescricao = parseInt($('#mapDescricao').value);
    const idxValor = parseInt($('#mapValor').value);
    const contaId = $('#contaDestinoCsv').value;
    const [ano] = mesAtual.split('-').map(Number);

    const candidatos = linhas.map(linha => {
      const rawData = linha[idxData] || '';
      const rawValor = linha[idxValor] || '0';
      const descricao = (linha[idxDescricao] || '').trim();
      let dataISO = rawData;
      if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(rawData)) {
        dataISO = normalizarDataCsv(rawData, ano);
      }
      const valorNum = DB.parseBRLInput(rawValor);
      return {
        data: dataISO,
        descricao,
        valor: Math.abs(valorNum),
        tipoSugerido: valorNum < 0 ? 'despesa' : 'receita',
        confiancaBaixa: false,
        linhaOriginal: linha.join(' | '),
      };
    }).filter(c => c.descricao && c.valor);

    if (candidatos.length === 0) { toast('Nenhuma linha válida encontrada com esse mapeamento.', 'erro'); return; }
    abrirRevisao(candidatos, contaId, 'csv');
  }

  function normalizarDataCsv(str, anoRef) {
    const [d, m, a] = str.split('/');
    const ano = a.length === 2 ? '20' + a : a;
    return `${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  function abrirRevisao(candidatos, contaId, origem) {
    const mes = DB.getMes(db, mesAtual);
    reviewPendentes = candidatos.map(c => ({
      ...c,
      incluir: true,
      categoriaId: c.categoriaSugerida || sugerirCategoria(c.descricao, db.categorias),
      contaId,
      origem,
      duplicado: DB.isDuplicado(mes, { data: c.data, valor: c.valor, descricao: c.descricao }),
    })).map(c => c.duplicado ? { ...c, incluir: false } : c);

    renderTabelaRevisao();
    $('#reviewPanel').hidden = false;
    $('#reviewPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTabelaRevisao() {
    const tbody = $('#tabelaReview tbody');
    tbody.innerHTML = reviewPendentes.map((c, i) => `
      <tr class="${c.duplicado ? 'linha-duplicada' : ''} ${c.confiancaBaixa ? 'linha-baixa-confianca' : ''}">
        <td><input type="checkbox" data-i="${i}" class="chk-incluir" ${c.incluir ? 'checked' : ''}></td>
        <td><input type="date" data-i="${i}" data-campo="data" value="${c.data}" class="input-review"></td>
        <td><input type="text" data-i="${i}" data-campo="descricao" value="${escapeHtml(c.descricao)}" class="input-review input-review-desc"></td>
        <td><input type="text" data-i="${i}" data-campo="valor" value="${c.valor.toFixed(2).replace('.', ',')}" class="input-review input-review-valor"></td>
        <td>
          <select data-i="${i}" data-campo="tipoSugerido" class="input-review">
            <option value="despesa" ${c.tipoSugerido === 'despesa' ? 'selected' : ''}>Despesa</option>
            <option value="receita" ${c.tipoSugerido === 'receita' ? 'selected' : ''}>Receita</option>
            <option value="transferencia" ${c.tipoSugerido === 'transferencia' ? 'selected' : ''}>Transferência</option>
          </select>
        </td>
        <td>
          <select data-i="${i}" data-campo="categoriaId" class="input-review">
            ${db.categorias.map(cat => `<option value="${cat.id}" ${cat.id === c.categoriaId ? 'selected' : ''}>${cat.nome}</option>`).join('')}
          </select>
        </td>
        <td>${c.duplicado ? '<span class="badge-aviso">Possível duplicado</span>' : (c.confiancaBaixa ? '<span class="badge-info">Confirme o tipo</span>' : '')}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.chk-incluir').forEach(chk => {
      chk.addEventListener('change', (e) => reviewPendentes[e.target.dataset.i].incluir = e.target.checked);
    });
    tbody.querySelectorAll('select[data-campo], input[data-campo]').forEach(el => {
      el.addEventListener('change', (e) => {
        const i = e.target.dataset.i, campo = e.target.dataset.campo;
        reviewPendentes[i][campo] = campo === 'valor' ? DB.parseBRLInput(e.target.value) : e.target.value;
      });
    });
  }

  function initRevisao() {
    $('#btnCancelarImport').addEventListener('click', () => {
      reviewPendentes = [];
      $('#reviewPanel').hidden = true;
    });
    $('#btnConfirmarImport').addEventListener('click', () => {
      const mes = DB.getMes(db, mesAtual);
      let count = 0;
      for (const c of reviewPendentes) {
        if (!c.incluir) continue;
        mes.lancamentos.push({
          id: DB.novoId(),
          data: c.data,
          descricao: c.descricao,
          valor: Math.abs(c.valor),
          tipo: c.tipoSugerido,
          categoriaId: c.categoriaId,
          contaId: c.contaId,
          origem: c.origem,
          criadoEm: new Date().toISOString(),
        });
        count++;
      }
      salvar();
      reviewPendentes = [];
      $('#reviewPanel').hidden = true;
      $('#pdfStatus').textContent = '';
      $('#filePdf').value = '';
      $('#fileCsv').value = '';
      $('#csvMapping').hidden = true;
      renderTudo();
      toast(`${count} lançamento(s) importado(s) com sucesso!`, 'sucesso');
    });
  }

  // ---------- categorias ----------
  function renderCategorias() {
    const cont = $('#listaCategorias');
    cont.innerHTML = db.categorias.map(cat => `
      <div class="cat-card" data-id="${cat.id}">
        <div class="cat-cor" style="background:${cat.cor}"></div>
        <input type="text" class="cat-nome" value="${escapeHtml(cat.nome)}" ${cat.id === 'outros' ? 'disabled' : ''}>
        <input type="color" class="cat-cor-input" value="${cat.cor}">
        <input type="text" class="cat-palavras" placeholder="palavras-chave separadas por vírgula" value="${cat.palavras.join(', ')}">
        <button class="icon-btn" data-acao="excluir-cat" ${cat.id === 'outros' ? 'disabled' : ''} title="Excluir categoria">🗑️</button>
      </div>
    `).join('');

    cont.querySelectorAll('.cat-card').forEach(card => {
      const id = card.dataset.id;
      const cat = db.categorias.find(c => c.id === id);
      card.querySelector('.cat-nome').addEventListener('change', (e) => { cat.nome = e.target.value; salvar(); });
      card.querySelector('.cat-cor-input').addEventListener('change', (e) => { cat.cor = e.target.value; salvar(); renderCategorias(); });
      card.querySelector('.cat-palavras').addEventListener('change', (e) => {
        cat.palavras = e.target.value.split(',').map(p => p.trim()).filter(Boolean);
        salvar();
      });
      const btnExcluir = card.querySelector('[data-acao="excluir-cat"]');
      if (btnExcluir) btnExcluir.addEventListener('click', () => {
        if (!confirm(`Excluir a categoria "${cat.nome}"? Lançamentos existentes serão movidos para "Outros".`)) return;
        Object.values(db.meses).forEach(m => m.lancamentos.forEach(l => { if (l.categoriaId === id) l.categoriaId = 'outros'; }));
        db.categorias = db.categorias.filter(c => c.id !== id);
        salvar();
        renderCategorias();
        renderTudo();
      });
    });
  }

  function initNovaCategoria() {
    $('#btnNovaCategoria').addEventListener('click', () => {
      const nome = prompt('Nome da nova categoria:');
      if (!nome) return;
      const id = normalizarTexto(nome).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || DB.novoId();
      if (db.categorias.some(c => c.id === id)) { toast('Já existe uma categoria com esse nome.', 'erro'); return; }
      db.categorias.push({ id, nome, cor: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'), palavras: [] });
      salvar();
      renderCategorias();
    });
  }

  // ---------- configurações ----------
  function renderConfig() {
    const cont = $('#listaContas');
    cont.innerHTML = db.contas.map(conta => `
      <div class="conta-card" data-id="${conta.id}">
        <input type="text" class="conta-nome" value="${escapeHtml(conta.nome)}">
        <select class="conta-tipo">
          <option value="corrente" ${conta.tipo === 'corrente' ? 'selected' : ''}>Conta corrente</option>
          <option value="cartao" ${conta.tipo === 'cartao' ? 'selected' : ''}>Cartão de crédito</option>
          <option value="poupanca" ${conta.tipo === 'poupanca' ? 'selected' : ''}>Poupança</option>
          <option value="investimento" ${conta.tipo === 'investimento' ? 'selected' : ''}>Investimento</option>
        </select>
        <button class="icon-btn" data-acao="excluir-conta" title="Excluir conta">🗑️</button>
      </div>
    `).join('');

    cont.querySelectorAll('.conta-card').forEach(card => {
      const id = card.dataset.id;
      const conta = db.contas.find(c => c.id === id);
      card.querySelector('.conta-nome').addEventListener('change', (e) => { conta.nome = e.target.value; salvar(); });
      card.querySelector('.conta-tipo').addEventListener('change', (e) => { conta.tipo = e.target.value; salvar(); });
      card.querySelector('[data-acao="excluir-conta"]').addEventListener('click', () => {
        if (db.contas.length <= 1) { toast('Mantenha pelo menos uma conta.', 'erro'); return; }
        if (!confirm(`Excluir a conta "${conta.nome}"?`)) return;
        db.contas = db.contas.filter(c => c.id !== id);
        salvar();
        renderConfig();
      });
    });
  }

  function initNovaConta() {
    $('#btnNovaConta').addEventListener('click', () => {
      const nome = prompt('Nome da nova conta:');
      if (!nome) return;
      db.contas.push({ id: DB.novoId(), nome, tipo: 'corrente' });
      salvar();
      renderConfig();
    });
  }

  function initBackup() {
    const exportar = () => {
      const blob = new Blob([DB.exportJSON(db)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `assistente-financeiro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast('Backup exportado.', 'sucesso');
    };
    $('#btnExport').addEventListener('click', exportar);
    $('#btnExportConfig')?.addEventListener('click', exportar);

    const importar = (fileInput) => {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            if (!confirm('Importar este backup vai substituir todos os dados atuais. Continuar?')) return;
            db = DB.importJSON(reader.result);
            salvar();
            renderTudo();
            toast('Backup importado com sucesso.', 'sucesso');
          } catch (e) {
            toast('Arquivo de backup inválido: ' + e.message, 'erro');
          }
        };
        reader.readAsText(file, 'utf-8');
        fileInput.value = '';
      });
    };
    $('#btnImportBackup').addEventListener('click', () => $('#fileBackup').click());
    importar($('#fileBackup'));
    $('#btnImportBackupConfig')?.addEventListener('click', () => $('#fileBackupConfig').click());
    importar($('#fileBackupConfig'));
  }

  function initLimparMes() {
    $('#btnLimparMes').addEventListener('click', () => {
      if (!confirm(`Apagar todos os lançamentos de ${DB.nomeMes(mesAtual)}? Esta ação não pode ser desfeita.`)) return;
      const mes = DB.getMes(db, mesAtual);
      mes.lancamentos = [];
      mes.saldoInicial = 0;
      mes.saldoFinalInformado = null;
      salvar();
      renderTudo();
      toast('Dados do mês apagados.');
    });
  }

  function initDadosExemplo() {
    const carregar = () => {
      const mes = DB.getMes(db, mesAtual);
      const base = [
        ['05', 'Salário', 4500, 'receita', 'salario', 'conta-corrente'],
        ['06', 'Aluguel', 1400, 'despesa', 'moradia', 'conta-corrente'],
        ['08', 'Supermercado Extra', 380.5, 'despesa', 'alimentacao', 'conta-corrente'],
        ['10', 'Uber', 42.9, 'despesa', 'transporte', 'cartao-credito'],
        ['12', 'Netflix', 39.9, 'despesa', 'lazer', 'cartao-credito'],
        ['15', 'iFood', 68.3, 'despesa', 'alimentacao', 'cartao-credito'],
        ['18', 'Farmácia', 95.2, 'despesa', 'saude', 'cartao-credito'],
        ['20', 'Pagamento fatura cartão', 246.3, 'transferencia', 'transferencia', 'conta-corrente'],
        ['22', 'Freelance recebido', 800, 'receita', 'salario', 'conta-corrente'],
        ['25', 'Conta de luz', 210, 'despesa', 'moradia', 'conta-corrente'],
      ];
      for (const [dia, desc, valor, tipo, cat, conta] of base) {
        mes.lancamentos.push({
          id: DB.novoId(), data: `${mesAtual}-${dia}`, descricao: desc, valor,
          tipo, categoriaId: cat, contaId: conta, origem: 'manual', criadoEm: new Date().toISOString(),
        });
      }
      salvar();
      renderTudo();
      toast('Dados de exemplo carregados (fictícios, apenas para demonstração).', 'sucesso');
    };
    $('#btnCarregarDemo')?.addEventListener('click', carregar);
    $('#btnCarregarDemoConfig')?.addEventListener('click', carregar);
  }

  function initAtalhosDashboard() {
    $('#btnGoImportar')?.addEventListener('click', () => $('.tab[data-tab="importar"]').click());
  }

  // ---------- render geral ----------
  function renderTudo() {
    renderFiltrosLancamentos();
    renderDashboard();
    if ($('#tab-lancamentos').classList.contains('active')) renderTabelaLancamentos();
    if ($('#tab-categorias').classList.contains('active')) renderCategorias();
    if ($('#tab-config').classList.contains('active')) renderConfig();
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initMonthPicker();
    initReconciliacao();
    initModalLancamento();
    initFiltrosLancamentos();
    initImportTabs();
    initDropzones();
    initRevisao();
    initNovaCategoria();
    initNovaConta();
    initBackup();
    initLimparMes();
    initDadosExemplo();
    initAtalhosDashboard();
    renderTudo();
  });
})();
