# Assistente Financeiro — Dashboard Modular Mensal

Dashboard financeiro pessoal em HTML/CSS/JS puro (sem backend, sem build).
Todos os dados ficam salvos no navegador (`localStorage`) e podem ser
exportados/importados como backup em JSON.

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

## Backup

Como os dados vivem apenas no `localStorage` do navegador (não há
servidor), exporte um backup em **Configurações → Exportar backup**
regularmente — principalmente antes de limpar o cache do navegador ou
trocar de computador.
