// Tela Painel (dono e gerente): vendas do mês vindas da Saipos.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { dataBR } from './lancamentos.js';
import { rotuloMes } from './meses.js';
import { icone } from './icones.js';

// Cores dos canais: tokens do DESIGN.md (definidos em estilo.css).
export const CANAIS = {
  ifood: ['iFood', 'var(--canal-ifood)'],
  alloy: ['Alloy (Liga)', 'var(--canal-alloy)'],
  telefone: ['WhatsApp, Insta e telefone', 'var(--canal-telefone)'],
  goomer: ['Goomer (totens)', 'var(--canal-goomer)'],
  delivery_much: ['Delivery Much', 'var(--canal-dm)'],
  // Canais de SP (08/10/2026). Cada unidade mostra só os canais em que vendeu.
  keeta: ['Keeta', 'var(--canal-keeta)'],
  '99food': ['99 Food', 'var(--canal-99food)'],
  site: ['Site Delivery (Saipos)', 'var(--canal-site)'],
  // Salão de SP separado no Painel (dono, 08/10/2026): totens do iFood e pedidos na ficha.
  totem_ifood: ['Totem iFood (salão)', 'var(--canal-totem)'],
  ficha_salao: ['Ficha Salão', 'var(--canal-ficha)'],
  outro: ['Outros', 'var(--line-strong)'],
};

export const reais = (n, casas = 2) => 'R$ ' + Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const pct = (n, casas = 1) => Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
const inteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
// "2026-10-06" -> "segunda-feira"
const diaDaSemana = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' });
};

export function cabecalho(titulo, etiqueta, nomeIcone) {
  return el('div', { class: 'section-head' },
    nomeIcone && icone(nomeIcone),
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
  const mes = ctx.mes;
  const u = ctx.unidade.codigo;
  const [{ data: p, error }, { data: cmv }] = await Promise.all([
    supabase.rpc('painel_mes', { p_unidade: u, p_mes: mes }),
    // Última quinzena lançada dentro do mês escolhido (as quinzenas começam no dia 1 ou 16).
    supabase.from('cmv_quinzena').select('*').eq('unidade', u).in('inicio', [mes, mes.slice(0, 8) + '16'])
      .order('inicio', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar o Painel: ' + error.message)));
    return;
  }

  const fat = Number(p.faturamento);
  const canais = p.canais.map((c) => ({ ...c, rotulo: CANAIS[c.canal]?.[0] ?? c.canal, cor: CANAIS[c.canal]?.[1] ?? CANAIS.outro[1] }));

  const secFaturamento = el('section', { class: 'sec-faturamento' },
    cabecalho(`Faturamento acumulado · ${ctx.unidade.nome}`, p.atualizado_ate ? `até ${dataBR(p.atualizado_ate)}` : 'sem vendas ainda', 'dinheiro'),
    el('div', { class: 'hero-wrap' }, el('p', { class: 'hero-value' }, el('sup', {}, 'R$'), Math.round(fat).toLocaleString('pt-BR'))),
    el('p', { class: 'pedidos-mes' }, p.pedidos ? `${inteiro(p.pedidos)} pedidos no mês` : 'Sem vendas no mês ainda.'),
    // Últimos 3 dias com vendas no mês: data, dia da semana e faturamento.
    (p.ultimos_dias ?? []).length > 0 && el('div', { class: 'dias-recentes' },
      p.ultimos_dias.map((dia) => el('div', { class: 'dia-recente' },
        el('span', {}, dataBR(dia.data), el('span', { class: 'dia-semana' }, ` · ${diaDaSemana(dia.data)}`)),
        el('strong', {}, reais(dia.faturamento))))),
    !ctx.unidade.sincronizar && el('p', { class: 'aviso' },
      'A busca automática na Saipos ainda não está ligada para esta unidade (falta o token).'),
    el('div', { class: 'channel-bar' }, canais.map((c) => el('div', { style: `width:${fat ? (c.faturamento / fat) * 100 : 0}%; background:${c.cor}` }))),
    el('div', { class: 'channel-list' }, canais.map((c) => el('div', { class: 'channel-row' },
      el('span', { class: 'channel-name' }, el('span', { class: 'dot', style: `background:${c.cor}` }), c.rotulo),
      el('span', { class: 'channel-figures' },
        el('span', { class: 'channel-amount' }, reais(c.faturamento, 0)),
        el('span', { class: 'channel-pct' }, `${pct(fat ? (c.faturamento / fat) * 100 : 0)} · ${inteiro(c.pedidos)} pedidos`))))),
  );

  const t = p.ticket;
  const metaTicket = (k) => (p.metas?.[k]?.meta ? ` · meta ${reais(p.metas[k].meta, 0)}` : '');
  // Salão (gente comendo na loja) só existe em SP: a coluna aparece quando houve pedido de salão no mês.
  const tipos = [['balcao', 'Balcão / retirada'], ...(t.salao?.pedidos ? [['salao', 'Salão']] : []), ['delivery', 'Delivery']];
  const secTicket = el('section', { class: 'sec-ticket' },
    cabecalho('Ticket médio (acumulado mensal)', 'sem fiado', 'etiqueta'),
    el('div', { class: tipos.length === 3 ? 'grid-3' : 'grid-2' },
      tipos.map(([k, rotulo]) => el('div', {},
        el('p', { class: 'stat-sub' }, rotulo), el('p', { class: 'stat-value' }, t[k]?.valor ? reais(t[k].valor) : '—'),
        el('p', { class: 'stat-sub' }, `${inteiro(t[k]?.pedidos)} pedidos${metaTicket(`ticket_${k}`)}`)))),
  );

  const fimQuinzena = (inicio) => {
    const [a, m, d] = inicio.split('-').map(Number);
    return d === 1 ? `15/${String(m).padStart(2, '0')}` : `${new Date(a, m, 0).getDate()}/${String(m).padStart(2, '0')}`;
  };
  const secCmv = el('section', { class: 'sec-cmv' },
    cabecalho('CMV quinzenal', null, 'porcento'),
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
  conteudo.append(el('div', { class: 'painel-grid' },
    secFaturamento,
    secTicket,
    secCmv,
    el('section', { class: 'sec-produtos' }, cabecalho('Produtos mais vendidos', rotuloMes(mes), 'chama'),
      el('p', { class: 'section-desc' }, 'Por faturamento, sem os lanches DIA dos funcionários'),
      ranking(p.produtos, { valor: (l) => Number(l.receita), sub: (l) => reais(l.receita, 0) })),
    el('section', { class: 'sec-burgers' }, cabecalho('Burgers mais vendidos', rotuloMes(mes), 'chama'),
      el('p', { class: 'section-desc' }, 'Combos + compras avulsas somados, por sabor'),
      ranking(p.burgers, { valor: (l) => Number(l.qtd) })),
    el('section', { class: 'sec-combos' }, cabecalho('Composição dos combos', rotuloMes(mes), 'burger'),
      el('p', { class: 'section-desc' }, `${inteiro(c.total)} combos no mês`),
      blocoCombo('Hambúrguer mais escolhido', c.burger, c.burgers_total),
      blocoCombo('Bebida mais escolhida', c.bebida, c.bebidas_total),
      blocoCombo('Adicional mais pedido', c.adicional, c.adicionais_total)),
  ));
}
