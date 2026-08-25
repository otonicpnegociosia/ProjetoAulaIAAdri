# Assistente Financeiro — Dashboard Modular Mensal

Dashboard financeiro pessoal em HTML/CSS/JS puro (sem build). Os dados
ficam salvos no navegador (`localStorage`) — o app funciona 100% offline
— e também são espelhados em um banco de dados real (Supabase/Postgres),
que serve como backup na nuvem e permite recuperar os dados atuais em um
navegador novo. Também é possível exportar/importar backup em JSON.

## Como usar

1. Abra `index.html` no navegador (duplo clique funciona; se preferir,
   sirva com `python3 -m http.server` ou similar para evitar eventuais
   restrições de `file://` em alguns navegadores).
2. É necessária internet apenas para carregar as bibliotecas de gráficos
   (Chart.js) e leitura de PDF (pdf.js), vindas de CDN. Sem internet, o
   restante do app (lançamentos, importação de CSV, categorias) continua
   funcionando normalmente — só os gráficos ficam indisponíveis.

## Como o sistema é organizado (módulos)

| Arquivo | Responsabilidade |
|---|---|
| `js/db.js` | Persistência em `localStorage`, modelo de dados, formatação de moeda |
| `js/categorias.js` | Categorias padrão e auto-categorização por palavra-chave |
| `js/supabaseClient.js` | Configura a conexão com o banco de dados (Supabase) |
| `js/supabaseSync.js` | Sincroniza `localStorage` ↔ tabelas do banco (contas, categorias, meses, lançamentos) |
| `js/csvImport.js` | Leitura de CSV e sugestão de mapeamento de colunas |
| `js/pdfImport.js` | Extração de texto de PDF (pdf.js) + parser heurístico de lançamentos |
| `js/charts.js` | Gráficos (Chart.js): categorias, evolução mensal, saldo por conta |
| `js/ui.js` | Controlador da interface: abas, dashboard, tabela, modais, importação |

**Por que é "mensal e modular":** cada mês (`YYYY-MM`) tem seu próprio
conjunto de lançamentos, navegável pelo seletor de mês no topo. Contas
(conta corrente, cartão de crédito, poupança...) e categorias são
configuráveis e compartilhadas entre todos os meses.

## Funcionalidades

- **Dashboard**: receitas, despesas, saldo do mês, total da fatura do
  cartão, gráfico de despesas por categoria, evolução dos últimos 6
  meses, saldo por conta.
- **Reconciliação de saldo**: informe o saldo inicial e o saldo final do
  extrato real — o sistema calcula a diferença e avisa se algum
  lançamento pode estar faltando.
- **Lançamentos**: lista completa com busca e filtros por categoria,
  conta e tipo; criar/editar/excluir manualmente.
- **Importar PDF** (extrato bancário ou fatura de cartão): o texto do PDF
  é extraído no navegador e um parser heurístico tenta identificar
  data + descrição + valor de cada linha. **Nada é importado direto** —
  tudo passa por uma tela de revisão onde você confirma, corrige ou
  descarta cada lançamento antes de gravar. Possíveis duplicados
  (mesma data/valor/descrição de um lançamento já existente) vêm
  desmarcados e sinalizados.
- **Importar CSV**: você mapeia manualmente qual coluna é data,
  descrição e valor — funciona com qualquer exportação de banco.
- **Categorias**: editar nome, cor e palavras-chave de auto-categorização,
  criar/excluir categorias.
- **Configurações**: gerenciar contas, exportar/importar backup completo
  (JSON), apagar os lançamentos do mês atual, carregar dados de exemplo
  fictícios para conhecer o sistema.

## Sobre a importação dos seus PDFs reais

Este ambiente de execução (sessão remota na nuvem) não tem acesso ao
seu computador — por isso não consegui ler os arquivos
`extrato-bancario-julho-2026.pdf` e `fatura-cartao-julho-2026.pdf` que
você referenciou pelo caminho local do Windows. O parser em
`js/pdfImport.js` foi construído para os formatos mais comuns (uma
linha por lançamento, com data no início e valor em R$ no final), mas
cada banco/operadora tem um layout diferente.

**Para calibrar o parser com o formato exato do seu banco:** envie os
PDFs (ou algumas linhas de exemplo copiadas do extrato/fatura) diretamente
nesta conversa — aí consigo ajustar as expressões regulares em
`parseLancamentos()` para o seu caso específico. Enquanto isso, a tela
de revisão garante que qualquer erro de leitura seja corrigido antes de
qualquer lançamento entrar no sistema, e a importação por CSV é uma
alternativa mais confiável se o seu banco permitir exportar nesse
formato.

## Banco de dados (Supabase)

Além do `localStorage`, o app está ligado a um banco Postgres no
Supabase (projeto `Projeto1AulaIA`), com as tabelas:

- `contas` — contas cadastradas (conta corrente, cartão de crédito...)
- `categorias` — categorias e suas palavras-chave de auto-categorização
- `meses` — saldo inicial e saldo final informado de cada mês (`YYYY-MM`)
- `lancamentos` — todos os lançamentos, ligados a `meses`, `categorias` e `contas`

Como funciona a sincronização (`js/supabaseSync.js`):

- **Gravação**: toda vez que o app salva algo (`salvar()` em `js/ui.js`),
  os dados também são enviados (upsert) para as tabelas acima, em segundo
  plano, sem travar a interface.
- **Leitura**: toda vez que o app é aberto, ele busca a versão mais atual
  dos dados direto do banco (antes de mostrar a tela) e substitui o que
  estiver em `localStorage` — assim navegadores/dispositivos diferentes
  ficam sincronizados com os mesmos dados atuais.
- **Modo offline**: se não houver internet ou o Supabase estiver
  indisponível, tudo isso falha silenciosamente (só um aviso no console)
  e o app continua funcionando normalmente só com `localStorage` — igual
  já acontecia antes com os gráficos (Chart.js) e a leitura de PDF (pdf.js).
- **Segurança**: o app não tem tela de login nem Row Level Security — o
  acesso às tabelas é direto, usando a chave pública (`publishable key`).
  Não há isolamento entre usuários nem proteção contra escrita: qualquer
  pessoa com a chave (exposta no próprio código do front-end) consegue
  ler e alterar os dados. Isso é aceitável aqui por ser um projeto de
  estudo/uso pessoal de uma única pessoa; para um uso com dados sensíveis
  de verdade, o recomendado seria habilitar autenticação e RLS.

## Backup

Além do banco de dados, exporte um backup local em
**Configurações → Exportar backup** regularmente — principalmente antes
de limpar o cache do navegador ou trocar de computador.
