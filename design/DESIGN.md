# Layout "suave" — guia visual do sistema Queijo e Carne

Este arquivo descreve o visual novo do sistema. A referência exata está em `referencia/queijo-e-carne-sistema-suave.html` (abra no navegador) e os prints estão em `prints/`. `referencia/estilos.css` tem toda a folha de estilos pronta para copiar.

**Regra principal: mudar só o visual.** Nenhum texto, número, regra de cálculo ou comportamento muda. Se algo no projeto real for diferente do protótipo, o projeto real manda no conteúdo e este guia manda no visual.

## Direção
Fundo manteiga suave, cartões claros, texto em marrom escuro e o âmbar da marca só nos detalhes. Um único destaque forte: o cartão de faturamento, escuro, com o número em âmbar. Todo o resto é quieto. Tem tema claro (padrão) e tema escuro, que segue o do aparelho (`prefers-color-scheme`).

## Cores (definir como variáveis/tokens, nunca valores soltos)
| Token | Claro | Escuro | Uso |
|---|---|---|---|
| bg | `#F6EDD3` | `#150E09` | fundo da página |
| card | `#FFFBEE` | `#1F1610` | cartões |
| card-2 | `#FAF1D6` | `#281D15` | campos, blocos internos |
| ink | `#2B1E12` | `#F3E9D6` | texto principal |
| ink-2 | `#5A4A36` | `#C9BA9F` | texto secundário |
| ink-3 | `#6F5E48` | `#A39479` | texto de apoio |
| line | `#E6D8B2` | `#33261B` | divisórias |
| line-strong | `#CDBB8A` | `#4A382A` | bordas de campos |
| accent | `#E3A02B` | `#F0B13A` | preenchimentos e botão principal |
| accent-ink | `#8A5600` | `#F0B13A` | ícones e texto em âmbar |
| good / bad | `#2F6B35` / `#A33A2B` | `#8FC272` / `#EA8575` | status (cada um com versão "soft" translúcida e "line" para contorno) |
| bar | `#231710` | `#0E0905` | barra superior |

Cores fixas (iguais nos dois temas): cartão de faturamento `#2B1E12`, número do faturamento `#F2B646`, aba ativa `#F0B13A` com texto `#231710`.

Cores dos canais de venda (sobre o cartão escuro): iFood `#E9A93A`, Alloy `#6CA3D9`, WhatsApp/Insta/Telefone `#A98BD6`, Goomer `#7DBE7E`, Delivery Much `#E58A7B`.

Estado "invertido" (meta superada): um conjunto de tokens `inv-*` (fundo, texto, divisórias, verde e vermelho próprios). No tema claro o cartão fica marrom escuro com texto claro; no escuro fica âmbar com texto escuro. A técnica é redefinir os tokens `ink`, `line` etc. dentro do cartão, assim tudo que está dentro se adapta sozinho.

## Tipografia
Família única: **Instrument Sans** (Google Fonts, pesos 400, 500, 600, 700), com fallback `system-ui`. Números sempre com `font-variant-numeric: tabular-nums`.

| Papel | Tamanho / peso |
|---|---|
| Corpo | 14,5px / 400 |
| Texto de apoio | 12,5 a 13px |
| Mínimo permitido | 12px |
| Título de cartão | 15 a 16px / 600 |
| Número de destaque (faturamento) | 44 a 64px / 600, espaçamento -0,025em |
| Números de indicador | 40px / 600 |
| Números de ticket | 34px / 600 |

## Estrutura da página
- **Barra superior fixa** (escura): logo com aro âmbar, nome, **as 4 abas** (Painel, Indicadores, Lançamentos, Histórico) e o mês vigente à direita. A aba ativa é um botão âmbar. No celular, as abas descem para uma segunda linha com rolagem horizontal.
- **Conteúdo** com largura máxima de 1280px, margem lateral de 20px (16px no celular), espaçamento entre cartões de 16px.
- **Cartões**: raio 14px, borda de 1px (`line`), sombra bem leve, padding 24px (18px no celular).

## Grade de cada aba (telas com 1000px ou mais; abaixo disso, uma coluna)
- **Painel** (6 colunas):
  1. Faturamento acumulado ocupa a largura toda. À esquerda o número e "Ontem"; à direita a barra de canais e a lista de canais (nome, valor em negrito, percentual).
  2. Ticket médio (3 colunas) e CMV semanal (3 colunas).
  3. Produtos mais vendidos (3) e Burgers mais vendidos (3).
  4. Composição dos combos ocupa a largura toda, com os 3 blocos lado a lado a partir de 860px.
- **Indicadores**: grade de 2 colunas (a partir de 860px). A seção em si não é um cartão; cada indicador é.
- **Lançamentos**: 3 colunas, cada uma um cartão (Semanal, CMV, Nutricionista).
- **Histórico**: lista de meses em um cartão; o resumo de um mês mostra os 6 blocos em grade (2 colunas a partir de 860px, 3 a partir de 1000px).

## Componentes
- **Selo de status** (`kpi-status`): raio 6px, texto 12px/600. `pending` cinza, `meta` verde suave, `fora` vermelho suave, `super` invertido (escuro no claro).
- **Cartão de indicador**: contorno verde suave quando na meta ou super meta, vermelho suave quando fora, neutro quando sem dados. **Não usar faixa colorida na lateral.** Meta batida: fundo verde suave e contorno verde. Super meta: cartão invertido. A recompensa ("+ R$ 100") é uma etiqueta no canto superior direito, invertida.
- **Custo dos erros**: dois blocos com fundo vermelho suave e contorno vermelho, valor em vermelho.
- **Barras** (ranking, combos, canais): trilho translúcido, altura 5 a 10px, ponta arredondada. O primeiro lugar do ranking usa âmbar; os demais usam `line-strong`.
- **Campos**: fundo `card-2`, borda `line-strong`, raio 8px, texto 14,5px. Foco visível com contorno de 2px em `accent-ink`.
- **Botão principal**: largura total, fundo `accent`, texto `#231710`, raio 10px, 600.
- **Botão secundário**: contorno `line-strong`, sem preenchimento.
- **Etiqueta "mês vigente"**: borda fina, raio 6px, 12px, alinhada à direita do título.

## Acessibilidade e responsivo
- Meta de contraste mínimo 4,5:1 para texto nos dois temas. Os tons foram escolhidos com essa meta, mas passe uma ferramenta de contraste nas telas finais para confirmar.
- Foco de teclado sempre visível.
- Sem rolagem horizontal da página em nenhuma largura (testado em 400px).
- Sem animações. Nenhuma é necessária.

## Como aplicar no projeto real
1. Defina os tokens da tabela acima no tema do projeto (claro e escuro).
2. Troque a fonte para Instrument Sans.
3. Reorganize a barra superior, as grades de cada aba e os cartões conforme as seções acima.
4. Compare cada tela com `prints/` e com a referência aberta no navegador.
5. Não altere textos, números nem regras de cálculo.
6. Quando o projeto tiver duas unidades (SM e SP), o seletor de unidade entra na barra superior, entre as abas e o mês vigente.
