/* ======================================================================
   supabaseClient.js — conexão com o banco de dados Supabase (projeto
   "Projeto1AulaIA"). As tabelas contas/categorias/meses/lancamentos
   espelham o modelo de dados usado em js/db.js.
====================================================================== */

const SUPABASE_URL = 'https://urzklkmbsowaggfcsfts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cBozDt20TpJ0Pw79UVpGYg_b_U72ZnC';

// window.supabase vem da CDN (@supabase/supabase-js) carregada no index.html.
// Se a lib não carregar (ex: sem internet), o cliente fica nulo e o app
// continua funcionando normalmente só com localStorage.
const supabaseClient = (window.supabase && SUPABASE_URL && SUPABASE_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
