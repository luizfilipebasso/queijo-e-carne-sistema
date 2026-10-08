// Tela Comparar (quem gerencia mais de uma unidade): unidades lado a lado e o total delas.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { hojeBrasil, dataBR } from './lancamentos.js';
import { reais, pct, cabecalho } from './painel.js';
import { avaliar, mmss } from './indicadores.js';

const ROTULO_STATUS = { super: 'super meta', meta: 'na meta', fora: 'fora da meta' };

// Cada linha: rótulo, como ler o valor, como mostrar e qual meta (se houver) avalia.
const LINHAS = [
  ['Faturamento', (x) => x.faturamento, (v) => reais(v, 0)],
  ['Pedidos', (x) => x.pedidos, (v) => Number(v).toLocaleString('pt-BR')],
  ['Ticket Balcão', (x) => x.ticket_balcao, (v) => reais(v), 'ticket_balcao'],
  ['Ticket Delivery', (x) => x.ticket_delivery, (v) => reais(v), 'ticket_delivery'],
  ['Tempo de cozinha', (x) => x.seg_cozinha, mmss, 'cozinha'],
  ['Aguardando entregador', (x) => x.seg_aguardando, mmss, 'aguardando'],
  ['CMV (média do mês)', (x) => x.cmv, (v) => pct(v), 'cmv'],
  ['Erros', (x) => x.erros_pct, (v) => pct(v, 2), 'erros'],
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

export async function telaComparar(conteudo) {
  const mes = hojeBrasil().slice(0, 8) + '01';
  const { data, error } = await supabase.rpc('comparativo_mes', { p_mes: mes });
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar o comparativo: ' + error.message)));
    return;
  }
  const unidades = data.unidades;
  const total = Number(data.total.faturamento) || 0;

  const barra = el('div', { class: 'channel-bar' }, unidades.map((u, i) =>
    el('div', { style: `width:${total ? (u.faturamento / total) * 100 : 0}%; background:${i === 0 ? '#F8A30D' : '#29B6F6'}` })));

  const tabela = el('table', { class: 'cmp-tabela' },
    el('thead', {}, el('tr', {},
      el('th', {}, ''),
      unidades.map((u) => el('th', {}, u.nome, el('small', {}, u.atualizado_ate ? `até ${dataBR(u.atualizado_ate).slice(0, 5)}` : 'sem dados'))),
      el('th', { class: 'cmp-total' }, 'Total'))),
    el('tbody', {}, LINHAS.map(([rotulo, ler, formatar, chaveMeta]) => el('tr', {},
      el('th', { scope: 'row' }, rotulo),
      unidades.map((u) => celula(ler(u), formatar, chaveMeta ? statusDe(u.metas, chaveMeta, ler(u)) : null)),
      // CMV não se soma entre unidades: no total fica em branco.
      chaveMeta === 'cmv'
        ? el('td', { class: 'cmp-total' }, '—')
        : el('td', { class: 'cmp-total' }, ler(data.total) === null || ler(data.total) === undefined ? '—' : formatar(Number(ler(data.total))))))),
  );

  conteudo.append(
    el('section', {},
      cabecalho('Comparativo do mês', 'unidades lado a lado'),
      el('div', { class: 'grid-2' }, unidades.map((u) => el('div', {},
        el('p', { class: 'stat-sub' }, u.nome),
        el('p', { class: 'stat-value' }, reais(u.faturamento, 0)),
        el('p', { class: 'stat-sub' }, total ? `${pct((u.faturamento / total) * 100)} do total` : '—')))),
      barra,
      el('p', { class: 'stat-sub' }, `Total das unidades: ${reais(total, 0)} em ${Number(data.total.pedidos).toLocaleString('pt-BR')} pedidos`),
    ),
    el('section', {},
      el('div', { class: 'cmp-rolagem' }, tabela),
      el('p', { class: 'section-desc', style: 'margin-top:12px' },
        'Tempos: só entregas, sem fiado (cozinha sem os pedidos acima do limite da unidade). O total junta os pedidos das unidades; o CMV não é somado.'),
    ),
  );
}
