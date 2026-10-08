// Tela Comparar (quem gerencia mais de uma unidade): unidades lado a lado e o total delas.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { dataBR } from './lancamentos.js';
import { reais, pct, cabecalho } from './painel.js';
import { avaliar, mmss } from './indicadores.js';

const ROTULO_STATUS = { super: 'super meta', meta: 'na meta', fora: 'fora da meta' };
// Cor de cada unidade na barra de faturamento (tokens do DESIGN.md).
const CORES_UNIDADE = ['var(--accent)', 'var(--canal-alloy)'];

// Cada linha: rótulo, como ler o valor, como mostrar e qual meta (se houver) avalia.
const LINHAS = [
  ['Faturamento', (x) => x.faturamento, (v) => reais(v, 0)],
  ['Pedidos', (x) => x.pedidos, (v) => Number(v).toLocaleString('pt-BR')],
  ['Ticket Balcão', (x) => x.ticket_balcao, (v) => reais(v), 'ticket_balcao'],
  ['Ticket Salão', (x) => x.ticket_salao, (v) => reais(v)],
  ['Ticket Delivery', (x) => x.ticket_delivery, (v) => reais(v), 'ticket_delivery'],
  ['Tempo de cozinha', (x) => x.seg_cozinha, mmss, 'cozinha'],
  ['Aguardando entregador', (x) => x.seg_aguardando, mmss, 'aguardando'],
  ['CMV (média do mês)', (x) => x.cmv, (v) => pct(v), 'cmv'],
  ['Erros', (x) => x.erros_pct, (v) => pct(v, 2), 'erros'],
  ['Erros cozinha', (x) => x.erros_cozinha_pct, (v) => pct(v, 2), 'erros_cozinha'],
  ['Erros atendimento', (x) => x.erros_atendimento_pct, (v) => pct(v, 2), 'erros_atendimento'],
];

// Ticket só tem meta (sem super meta): basta bater a meta.
function statusDe(metas, chave, valor) {
  const m = metas?.[chave];
  if (!m || valor === null || valor === undefined) return null;
  if (m.super_meta === null) return Number(valor) >= Number(m.meta) ? 'meta' : 'fora';
  return avaliar(m, Number(valor));
}

function celula(valor, formatar, status) {
  return el('td', { class: status ? `cmp-${status}` : '' },
    valor === null || valor === undefined ? '—' : formatar(Number(valor)),
    status && el('small', {}, ROTULO_STATUS[status]));
}

export async function telaComparar(conteudo, ctx) {
  const mes = ctx.mes;
  const { data, error } = await supabase.rpc('comparativo_mes', { p_mes: mes });
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar o comparativo: ' + error.message)));
    return;
  }
  const unidades = data.unidades;
  const total = Number(data.total.faturamento) || 0;

  const barra = el('div', { class: 'channel-bar' }, unidades.map((u, i) =>
    el('div', { style: `width:${total ? (u.faturamento / total) * 100 : 0}%; background:${CORES_UNIDADE[i % CORES_UNIDADE.length]}` })));

  const tabela = el('table', { class: 'cmp-tabela' },
    el('thead', {}, el('tr', {},
      el('th', {}, ''),
      unidades.map((u) => el('th', {}, u.nome, el('small', {}, u.atualizado_ate ? `até ${dataBR(u.atualizado_ate).slice(0, 5)}` : 'sem dados'))),
      el('th', { class: 'cmp-total' }, 'Total'))),
    el('tbody', {}, LINHAS.map(([rotulo, ler, formatar, chaveMeta]) => el('tr', {},
      el('th', { scope: 'row' }, rotulo),
      // Indicador que a unidade não usa (sem meta valendo, ex.: aguardando em SP) fica em branco.
      unidades.map((u) => (chaveMeta && !u.metas?.[chaveMeta]
        ? el('td', {}, '—')
        : celula(ler(u), formatar, chaveMeta ? statusDe(u.metas, chaveMeta, ler(u)) : null))),
      // CMV não se soma entre unidades: no total fica em branco.
      chaveMeta === 'cmv'
        ? el('td', { class: 'cmp-total' }, '—')
        : el('td', { class: 'cmp-total' }, ler(data.total) === null || ler(data.total) === undefined ? '—' : formatar(Number(ler(data.total))))))),
  );

  conteudo.append(
    el('section', {},
      cabecalho('Comparativo do mês', 'unidades lado a lado', 'alvo'),
      // Total das unidades em evidência, ao lado de cada unidade (pedido do dono, 08/10/2026).
      el('div', { class: 'grid-3' },
        unidades.map((u, i) => el('div', {},
          el('p', { class: 'stat-sub cmp-unidade' }, el('span', { class: 'dot', style: `background:${CORES_UNIDADE[i % CORES_UNIDADE.length]}` }), u.nome),
          el('p', { class: 'stat-value' }, reais(u.faturamento, 0)),
          el('p', { class: 'stat-sub' }, total ? `${pct((u.faturamento / total) * 100)} do total · ${Number(u.pedidos).toLocaleString('pt-BR')} pedidos` : '—'))),
        el('div', { class: 'cmp-total-bloco' },
          el('p', { class: 'stat-sub' }, 'Total das unidades'),
          el('p', { class: 'stat-value' }, reais(total, 0)),
          el('p', { class: 'stat-sub' }, `${Number(data.total.pedidos).toLocaleString('pt-BR')} pedidos`))),
      barra,
    ),
    el('section', {},
      el('div', { class: 'cmp-rolagem' }, tabela),
      el('p', { class: 'section-desc cmp-nota' },
        'Tempos sem fiado e sem os pedidos acima do limite da unidade. Cozinha: só entregas em Santa Maria; entregas, balcão e salão em São Paulo. — = indicador que a unidade não usa. O total junta os pedidos das unidades; o CMV não é somado.'),
    ),
  );
}
