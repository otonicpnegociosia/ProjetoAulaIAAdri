/* ======================================================================
   categorias.js — categorias padrão e motor de auto-categorização
====================================================================== */

const CATEGORIAS_PADRAO = [
  { id: 'alimentacao', nome: 'Alimentação', cor: '#f97316', palavras: ['ifood', 'restaurante', 'lanchonete', 'padaria', 'supermercado', 'mercado', 'acougue', 'hortifruti', 'burger', 'pizza', 'steakhouse', 'outback'] },
  { id: 'transporte', nome: 'Transporte', cor: '#3b82f6', palavras: ['uber', '99app', '99pop', 'posto', 'combustivel', 'gasolina', 'estacionamento', 'pedagio', 'metro', 'onibus', 'ipva', 'taxi'] },
  { id: 'moradia', nome: 'Moradia', cor: '#8b5cf6', palavras: ['aluguel', 'condominio', 'energia', 'enel', 'cemig', 'copel', 'luz', 'agua', 'sabesp', 'saneamento', 'gas', 'iptu', 'diarista', 'faxina'] },
  { id: 'saude', nome: 'Saúde', cor: '#ef4444', palavras: ['farmacia', 'drogaria', 'drogasil', 'raia', 'hospital', 'clinica', 'laboratorio', 'plano de saude', 'unimed', 'academia', 'smartfit'] },
  { id: 'educacao', nome: 'Educação', cor: '#06b6d4', palavras: ['escola', 'faculdade', 'curso', 'mensalidade', 'udemy', 'livro', 'livraria', 'alura', 'cultura inglesa', 'idiomas'] },
  { id: 'lazer', nome: 'Lazer', cor: '#ec4899', palavras: ['netflix', 'spotify', 'cinema', 'ingresso', 'viagem', 'hotel', 'bar ', 'show', 'disney', 'hbo', 'amazon prime', 'icloud', 'apple.com', 'presente'] },
  { id: 'compras', nome: 'Compras', cor: '#eab308', palavras: ['magazine luiza', 'americanas', 'shopee', 'mercado livre', 'amazon', 'shopping', 'renner', 'riachuelo', 'decathlon'] },
  { id: 'servicos', nome: 'Serviços / Assinaturas', cor: '#14b8a6', palavras: ['assinatura', 'celular', 'vivo', 'claro', 'tim', 'internet', 'telefone', 'anuidade', 'tarifa'] },
  { id: 'seguros', nome: 'Seguros', cor: '#0ea5e9', palavras: ['seguro', 'seguradora', 'porto seguro'] },
  { id: 'pets', nome: 'Pets', cor: '#a3712a', palavras: ['pet shop', 'petshop', 'veterinari', 'racao'] },
  { id: 'salario', nome: 'Salário / Renda', cor: '#22c55e', palavras: ['salario', 'pro-labore', 'honorarios', 'deposito', 'pix recebido', 'transferencia recebida', 'rendimento'] },
  { id: 'transferencia', nome: 'Transferência / Fatura', cor: '#64748b', palavras: ['pagamento de fatura', 'pagto fatura', 'fatura cartao', 'pix enviado', 'ted', 'doc ', 'transferencia enviada', 'aplicacao', 'resgate', 'investimento'] },
  { id: 'outros', nome: 'Outros', cor: '#94a3b8', palavras: [] },
];

function normalizarTexto(txt) {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // remove acentos
}

/** Sugere uma categoria com base em palavras-chave contidas na descrição. */
function sugerirCategoria(descricao, categorias) {
  const desc = normalizarTexto(descricao);
  for (const cat of categorias) {
    for (const palavra of (cat.palavras || [])) {
      const p = normalizarTexto(palavra);
      if (p && desc.includes(p)) return cat.id;
    }
  }
  return 'outros';
}

function corCategoria(categorias, id) {
  const c = categorias.find(c => c.id === id);
  return c ? c.cor : '#94a3b8';
}

function nomeCategoria(categorias, id) {
  const c = categorias.find(c => c.id === id);
  return c ? c.nome : 'Outros';
}
