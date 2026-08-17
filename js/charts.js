/* ======================================================================
   charts.js — wrappers finos sobre Chart.js para os gráficos do painel
====================================================================== */

const Charts = (() => {
  let chartCategorias = null;
  let chartEvolucao = null;
  let chartContas = null;

  function renderCategorias(canvas, totaisPorCategoria, categorias) {
    const entradas = Object.entries(totaisPorCategoria).filter(([, v]) => v > 0);
    const labels = entradas.map(([id]) => nomeCategoria(categorias, id));
    const valores = entradas.map(([, v]) => v);
    const cores = entradas.map(([id]) => corCategoria(categorias, id));

    if (chartCategorias) chartCategorias.destroy();
    if (entradas.length === 0) {
      chartCategorias = null;
      return false;
    }
    chartCategorias = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: valores, backgroundColor: cores, borderWidth: 0 }] },
      options: {
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${DB.formatBRL(ctx.raw)}` } },
        },
        cutout: '62%',
        maintainAspectRatio: false,
      },
    });
    return true;
  }

  function renderEvolucao(canvas, meses) {
    // meses: [{label, receitas, despesas}]
    if (chartEvolucao) chartEvolucao.destroy();
    chartEvolucao = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: meses.map(m => m.label),
        datasets: [
          { label: 'Receitas', data: meses.map(m => m.receitas), backgroundColor: '#22c55e', borderRadius: 4 },
          { label: 'Despesas', data: meses.map(m => m.despesas), backgroundColor: '#ef4444', borderRadius: 4 },
        ],
      },
      options: {
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${DB.formatBRL(ctx.raw)}` } },
        },
        scales: {
          y: { ticks: { callback: (v) => DB.formatBRL(v) } },
        },
        maintainAspectRatio: false,
      },
    });
  }

  function renderContas(canvas, totaisPorConta, contas) {
    const labels = contas.map(c => c.nome);
    const valores = contas.map(c => totaisPorConta[c.id] || 0);
    if (chartContas) chartContas.destroy();
    chartContas = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Saldo (receitas - despesas)',
          data: valores,
          backgroundColor: valores.map(v => v >= 0 ? '#22c55e' : '#ef4444'),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => DB.formatBRL(ctx.raw) } },
        },
        scales: { x: { ticks: { callback: (v) => DB.formatBRL(v) } } },
        maintainAspectRatio: false,
      },
    });
  }

  return { renderCategorias, renderEvolucao, renderContas };
})();
