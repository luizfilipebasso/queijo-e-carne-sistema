# Queijo e Carne — Sistema de Indicadores e Incentivos

Sistema interno da hamburgueria Queijo e Carne (Santa Maria-RS): painel de vendas, indicadores de metas e incentivos da equipe.

- `site/`: o site (HTML + JavaScript, sem etapa de build), publicado pelo GitHub Pages.
- `supabase/migrations/`: estrutura do banco (Postgres no Supabase), com as regras de acesso por papel.
- `supabase/functions/sincronizar-saipos/`: busca diária dos dados na API de Dados da Saipos.
- `scripts/`: ferramentas para testar no computador.

Nenhuma senha ou token fica neste repositório. A chave em `site/js/config.js` é a chave **publicável** do Supabase, feita para ficar no navegador; o acesso aos dados é controlado pelas regras do banco (Row Level Security) e pelo login com Google de e-mails autorizados.

Queijo e Carne Burger LTDA — CNPJ 37.208.946/0001-58
