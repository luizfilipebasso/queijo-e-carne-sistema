// Tela Painel (dono e gerente): vendas do mês vindas da Saipos.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { hojeBrasil, dataBR } from './lancamentos.js';

export const CANAIS = {
  ifood: ['iFood', '#F8A30D'],
  alloy: ['Alloy (Liga)', '#29B6F6'],
  telefone: ['WhatsApp, Insta e telefone', '#AB47BC'],
  goomer: ['Goomer (totens)', '#66BB6A'],
  delivery_much: ['Delivery Much', '#26A69A'],
  outro: ['Outros', '#7A6754'],
};

export const reais = (n, casas = 2) => 'R$ ' + Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const pct = (n, casas = 1) => Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
const inteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export function cabecalho(titulo, etiqueta) {
  return el('div', { class: 'section-head' },
    el('span', { class: 'title' }, titulo),
    etiqueta && el('span', { class: 'tag-example' }, etiqueta));
}

function ranking(linhas, { valor, sub }) {
  if (!linhas.length) return el('p', { class: 'section-desc' }, 'Sem dados ainda.');
  const maior = Math.max(...linhas.map(valor)) || 1;
  return el('div', {}, linhas.map((l, i) => el('div', { class: 'product-row' + (i === 0 ? ' top' : '') },
    el('span', { class: 'rank' }, i + 1),
    el('div', { class: 'product-info' },
      el('div', { class: 'product-name' }, l.nome),
      el('div', { class: 'product-bar-track' }, el('div', { class: 'product-bar-fill', style: `width:${(valor(l) / maior) * 100}%` }))),
    el('div', { class: 'product-figures' },
      el('div', { class: 'product-qty' }, `${inteiro(l.qtd)} un`),
      sub && el('div', { class: 'product-revenue' }, sub(l))),
  )));
}

function blocoCombo(titulo, linhas, total) {
  const maior = Math.max(...linhas.map((l) => l.qtd), 1);
  return el('div', { class: 'combo-block' },
    el('p', { class: 'combo-title' }, titulo),
    linhas.length
      ? linhas.map((l) => el('div', { class: 'combo-row' },
        el('span', { class: 'combo-name' }, l.nome),
        el('div', { class: 'combo-track' }, el('div', { class: 'combo-fill', style: `width:${(l.qtd / maior) * 100}%` })),
        el('span', { class: 'combo-figures' },
          el('span', { class: 'combo-qty' }, `${inteiro(l.qtd)} un`),
          el('span', { class: 'combo-pct' }, total ? pct((l.qtd / total) * 100) : ''))))
      : el('p', { class: 'section-desc' }, 'Sem dados ainda.'));
}

export async function telaPainel(conteudo, ctx) {
  const mes = hojeBrasil().slice(0, 8) + '01';
  const u = ctx.unidade.codigo;
  const [{ data: p, error }, { data: cmv }] = await Promise.all([
    supabase.rpc('painel_mes', { p_unidade: u, p_mes: mes }),
    supabase.from('cmv_quinzena').select('*').eq('unidade', u).order('inicio', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar o Painel: ' + error.message)));
    return;
  }

  const fat = Number(p.faturamento);
  const canais = p.canais.map((c) => ({ ...c, rotulo: CANAIS[c.canal]?.[0] ?? c.canal, cor: CANAIS[c.canal]?.[1] ?? '#7A6754' }));

  const secFaturamento = el('section', {},
    cabecalho(`Faturamento acumulado · ${ctx.unidade.nome}`, p.atualizado_ate ? `até ${dataBR(p.atualizado_ate)}` : 'sem vendas ainda'),
    !ctx.unidade.sincronizar && el('p', { class: 'aviso', style: 'margin-bottom:14px' },
      'A busca automática na Saipos ainda não está ligada para esta unidade (falta o token).'),
    el('div', { class: 'hero-wrap' }, el('p', { class: 'hero-value' }, el('sup', {}, 'R$ '), Math.round(fat).toLocaleString('pt-BR'))),
    el('p', { class: 'stat-sub', style: 'margin:14px 0 4px;' },
      p.ultimo_dia?.data ? `Dia ${dataBR(p.ultimo_dia.data)}: ${reais(p.ultimo_dia.faturamento)} · ${inteiro(p.pedidos)} pedidos no mês` : 'Sem vendas no mês ainda.'),
    el('div', { class: 'channel-bar' }, canais.map((c) => el('div', { style: `width:${fat ? (c.faturamento / fat) * 100 : 0}%; background:${c.cor}` }))),
    el('div', { class: 'channel-list' }, canais.map((c) => el('div', { class: 'channel-row' },
      el('span', { class: 'channel-name' }, el('span', { class: 'dot', style: `background:${c.cor}` }), c.rotulo),
      el('span', { class: 'channel-figures' },
        el('span', { class: 'channel-amount' }, reais(c.faturamento, 0)),
        el('span', { class: 'channel-pct' }, `${pct(fat ? (c.faturamento / fat) * 100 : 0)} · ${inteiro(c.pedidos)} pedidos`))))),
  );

  const t = p.ticket;
  const metaTicket = (k) => (p.metas?.[k]?.meta ? ` · meta ${reais(p.metas[k].meta, 0)}` : '');
  const secTicket = el('section', {},
    cabecalho('Ticket médio (acumulado mensal)', 'sem fiado'),
    el('div', { class: 'grid-2' },
      el('div', {}, el('p', { class: 'stat-sub' }, 'Balcão / retirada'), el('p', { class: 'stat-value' }, t.balcao?.valor ? reais(t.balcao.valor) : '—'),
        el('p', { class: 'stat-sub' }, `${inteiro(t.balcao?.pedidos)} pedidos${metaTicket('ticket_balcao')}`)),
      el('div', {}, el('p', { class: 'stat-sub' }, 'Delivery'), el('p', { class: 'stat-value' }, t.delivery?.valor ? reais(t.delivery.valor) : '—'),
        el('p', { class: 'stat-sub' }, `${inteiro(t.delivery?.pedidos)} pedidos${metaTicket('ticket_delivery')}`))),
  );

  const fimQuinzena = (inicio) => {
    const [a, m, d] = inicio.split('-').map(Number);
    return d === 1 ? `15/${String(m).padStart(2, '0')}` : `${new Date(a, m, 0).getDate()}/${String(m).padStart(2, '0')}`;
  };
  const secCmv = el('section', {},
    cabecalho('CMV quinzenal'),
    cmv
      ? el('div', {},
        el('p', { class: 'cmv-note' }, `Referente a ${dataBR(cmv.inicio).slice(0, 5)} até ${fimQuinzena(cmv.inicio)}`),
        el('p', { class: 'cmv-value' }, pct(cmv.cmv_pct)),
        el('div', { class: 'cmv-stock' },
          el('div', { class: 'cmv-stock-row' }, el('span', {}, 'Estoque inicial'), el('strong', {}, reais(cmv.estoque_inicial))),
          el('div', { class: 'cmv-stock-row' }, el('span', {}, 'Estoque final'), el('strong', {}, reais(cmv.estoque_final)))))
      : el('p', { class: 'section-desc' }, 'Nenhuma quinzena lançada ainda.'),
    p.metas?.cmv && el('p', { class: 'cmv-gauge-meta' }, `Meta: até ${pct(p.metas.cmv.meta, 0)} · super meta: até ${pct(p.metas.cmv.super_meta, 0)}`),
  );

  const c = p.combos;
  conteudo.append(
    secFaturamento,
    secTicket,
    secCmv,
    el('section', {}, cabecalho('Produtos mais vendidos', 'mês vigente'),
      el('p', { class: 'section-desc' }, 'Por faturamento, sem os lanches DIA dos funcionários'),
      ranking(p.produtos, { valor: (l) => Number(l.receita), sub: (l) => reais(l.receita, 0) })),
    el('section', {}, cabecalho('Burgers mais vendidos', 'mês vigente'),
      el('p', { class: 'section-desc' }, 'Combos + compras avulsas somados, por sabor'),
      ranking(p.burgers, { valor: (l) => Number(l.qtd) })),
    el('section', {}, cabecalho('Composição dos combos', 'mês vigente'),
      el('p', { class: 'section-desc' }, `${inteiro(c.total)} combos no mês`),
      blocoCombo('Hambúrguer mais escolhido', c.burger, c.burgers_total),
      blocoCombo('Bebida mais escolhida', c.bebida, c.bebidas_total),
      blocoCombo('Adicional mais pedido', c.adicional, c.adicionais_total)),
  );
}
