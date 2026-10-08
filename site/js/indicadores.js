// Tela Indicadores (todos): metas, super metas e prêmios do mês, da unidade selecionada.
// As metas e os prêmios vêm do banco (tabela metas, por unidade); veja CLAUDE.md.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { dataBR } from './lancamentos.js';
import { rotuloMes } from './meses.js';
import { pct, reais, cabecalho } from './painel.js';

const ROTULO_STATUS = { super: 'Super meta', meta: 'Na meta', fora: 'Fora da meta' };
// Indicadores que dão prêmio. As duas visitas da nutricionista usam a mesma meta ("nutri").
const PREMIADOS = ['aguardando', 'cozinha', 'cmv', 'ifood', 'f99', 'nutri1', 'nutri2', 'erros'];
const metaDe = (metas, chave) => metas[chave.startsWith('nutri') ? 'nutri' : chave];

export function avaliar(m, valor) {
  if (!m || valor === null || valor === undefined || Number.isNaN(valor)) return null;
  const meta = Number(m.meta), sup = Number(m.super_meta);
  if (m.maior_melhor) return valor >= sup ? 'super' : valor >= meta ? 'meta' : 'fora';
  return valor <= sup ? 'super' : valor <= meta ? 'meta' : 'fora';
}

export function premio(m, status) {
  if (!m) return 0;
  return status === 'super' ? Number(m.premio_super) : status === 'meta' ? Number(m.premio_meta) : 0;
}

const media = (lista) => (lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const fmt = (n, casas) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function selo(status, pendente) {
  return el('span', { class: 'kpi-status ' + (status ?? 'pending') }, status ? ROTULO_STATUS[status] : pendente);
}
function recompensa(valor) {
  return valor > 0 ? el('span', { class: 'ind-reward' }, `+ ${reais(valor, 0)}`) : null;
}

// Calcula tudo a partir do retorno de indicadores_mes. Reaproveitado pelo Histórico e pelo incentivo.
export function calcular(d) {
  const metas = d.metas ?? {};
  const r = {};
  r.aguardando = { valor: num(d.aguardando?.segundos), pedidos: d.aguardando?.pedidos ?? 0 };
  r.cozinha = { valor: num(d.cozinha?.segundos), pedidos: d.cozinha?.pedidos ?? 0, excluidos: d.cozinha?.excluidos ?? 0 };
  r.cmv = { valor: media(d.cmv.map((q) => num(q.cmv_pct)).filter((v) => v !== null)), quinzenas: d.cmv };
  r.ifood = { valor: media(d.notas.map((n) => num(n.nota_ifood)).filter((v) => v !== null)) };
  r.f99 = { valor: media(d.notas.map((n) => num(n.nota_99food)).filter((v) => v !== null)) };
  for (const v of [1, 2]) {
    const visita = d.nutri.find((n) => n.visita === v);
    r[`nutri${v}`] = { valor: num(visita?.nota), data: visita?.data };
  }
  const e = d.erros;
  const qtdErros = e.qtd_cozinha + e.qtd_atendimento;
  r.erros = {
    valor: e.dias_lancados > 0 && d.pedidos > 0 ? (qtdErros / d.pedidos) * 100 : null,
    qtd: qtdErros, dias: e.dias_lancados, pedidos: d.pedidos,
    custoCozinha: Number(e.custo_cozinha), custoAtendimento: Number(e.custo_atendimento),
  };
  for (const chave of PREMIADOS) {
    const item = r[chave];
    item.meta = metaDe(metas, chave);
    // O CMV só vale para prêmio com o mês fechado (as duas quinzenas lançadas e o mês encerrado).
    item.status = avaliar(item.meta, chave === 'cmv' && !d.mes_fechado ? null : item.valor);
    item.statusPrevia = avaliar(item.meta, item.valor);
    item.premio = premio(item.meta, item.status);
    item.premioPrevia = premio(item.meta, item.statusPrevia);
  }
  // Prêmio por pessoa de um setor: indicadores "todos" + o do setor.
  r.premioSetor = (setor, previa = false) => PREMIADOS
    .filter((k) => ['todos', setor].includes(r[k].meta?.publico))
    .reduce((s, k) => s + (previa ? r[k].premioPrevia : r[k].premio), 0);
  return r;
}

function textoMeta(m, formatar, prefixo = 'até') {
  if (!m) return 'Meta não cadastrada.';
  const p = m.maior_melhor ? '≥ ' : `${prefixo} `;
  return `Meta ${p}${formatar(m.meta)} (${reais(m.premio_meta, 0)}). Super meta ${p}${formatar(m.super_meta)} (${reais(m.premio_super, 0)}).`;
}

// "atingido": cartão com fundo de meta batida. Nos cartões com dois itens, só quando os dois batem (como no protótipo).
function card({ titulo, sub, publico, tom, premioValor, atingido = premioValor > 0, corpo }) {
  return el('div', { class: `ind-card${tom ? ' tone-' + tom : ''}${atingido ? ' reached' : ''}${tom === 'super' ? ' reached-super' : ''}` },
    el('div', { class: 'ind-head' },
      el('div', {}, el('p', { class: 'ind-title' }, titulo), el('p', { class: 'ind-sub' }, sub), el('span', { class: 'ind-aud' }, publico)),
      recompensa(premioValor)),
    corpo);
}

function linha(rotulo, detalhe, valor, status, pendente, premioValor) {
  return el('div', { class: 'ind-row' + (premioValor > 0 ? ' reached' : '') + (status === 'super' ? ' reached-super' : '') },
    el('span', { class: 'ind-row-label' }, rotulo, el('small', {}, detalhe)),
    el('span', { class: 'ind-row-value' }, valor),
    status !== undefined && selo(status, pendente),
    recompensa(premioValor));
}

const PUBLICO = { todos: 'Todos', cozinha: 'Cozinha', atendimento: 'Atendimento' };

function cardTempo(titulo, item, mes, extra) {
  const m = item.meta;
  const diferenca = item.valor !== null && m ? Math.round(item.valor - m.meta) : null;
  return card({
    titulo, sub: `só entregas, ${rotuloMes(mes)}, sem fiado`, publico: PUBLICO[m?.publico] ?? '—', tom: item.status, premioValor: item.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-label' }, 'Tempo médio'),
      el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, item.valor !== null ? mmss(item.valor) : '—'), selo(item.status, 'Sem dados')),
      el('p', { class: 'ind-meta' }, textoMeta(m, mmss)),
      el('div', { class: 'ind-detail' },
        linha('Diferença para a meta', m ? `meta de ${mmss(m.meta)}` : '',
          diferenca === null ? '—' : diferenca === 0 ? '0s' : `${diferenca > 0 ? '+' : '−'}${mmss(Math.abs(diferenca))}`),
        linha('Pedidos considerados', extra ?? 'entregas do mês', item.pedidos.toLocaleString('pt-BR')))),
  });
}

export function renderizarIndicadores(conteudo, d, { titulo } = {}) {
  const r = calcular(d);
  const previa = !d.mes_fechado;

  // Resumo de prêmios por setor: cartão em toda a largura no topo da grade.
  const resumo = el('div', { class: 'ind-card ind-resumo' },
    el('div', { class: 'grid-2' },
      el('div', {}, el('p', { class: 'stat-sub' }, 'Prêmios — Cozinha'), el('p', { class: 'stat-value' }, reais(r.premioSetor('cozinha', previa), 0)),
        el('p', { class: 'stat-sub' }, 'por pessoa, antes do desconto dos erros')),
      el('div', {}, el('p', { class: 'stat-sub' }, 'Prêmios — Atendimento'), el('p', { class: 'stat-value' }, reais(r.premioSetor('atendimento', previa), 0)),
        el('p', { class: 'stat-sub' }, 'por pessoa, antes do desconto dos erros'))),
    previa && el('p', { class: 'aviso ind-previa' },
      'Prévia: o mês ainda não fechou. O CMV entra no cálculo quando as duas quinzenas estiverem lançadas e o mês terminar.'),
  );

  const nomeQuinzena = (inicio) => (inicio.endsWith('-01') ? '1ª quinzena' : '2ª quinzena');
  const pct0 = (v) => pct(v, 0);
  const cardCmv = card({
    titulo: 'CMV', sub: 'média das 2 quinzenas; vale com o mês fechado', publico: PUBLICO[r.cmv.meta?.publico] ?? '—', tom: r.cmv.status, premioValor: r.cmv.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-label' }, d.mes_fechado ? 'Mês fechado' : 'Média parcial'),
      el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, r.cmv.valor !== null ? pct(r.cmv.valor) : '—'),
        selo(r.cmv.status, r.cmv.valor === null ? 'Sem lançamento' : 'Aguardando fechamento')),
      el('p', { class: 'ind-meta' }, textoMeta(r.cmv.meta, pct0)),
      el('div', { class: 'ind-detail' },
        r.cmv.quinzenas.length
          ? r.cmv.quinzenas.map((q) => linha(nomeQuinzena(q.inicio), `a partir de ${dataBR(q.inicio)}`, q.cmv_pct !== null ? pct(q.cmv_pct) : '—'))
          : el('p', { class: 'ind-empty' }, 'Nenhuma quinzena lançada neste mês.'))),
  });

  const nota = (v) => fmt(v, 2);
  // O 99food só aparece quando a meta dele está valendo no mês (dono, 08/10/2026: por enquanto só iFood).
  const com99 = Boolean(r.f99.meta);
  const plataformas = com99 ? [r.ifood, r.f99] : [r.ifood];
  const cardNotas = card({
    titulo: com99 ? 'Notas das plataformas' : 'Nota do iFood', sub: 'média das quinzenas do mês', publico: PUBLICO[r.ifood.meta?.publico] ?? '—',
    tom: plataformas.some((p) => p.status === 'fora') ? 'fora' : null, premioValor: plataformas.reduce((s, p) => s + p.premio, 0),
    atingido: plataformas.every((p) => p.premio > 0),
    corpo: el('div', {},
      el('p', { class: 'ind-meta' }, textoMeta(r.ifood.meta, nota) + (com99 ? ' Para cada plataforma.' : '')),
      el('div', { class: 'ind-detail ind-detail-plain' },
        linha('iFood', 'média do mês', r.ifood.valor !== null ? nota(r.ifood.valor) : '—', r.ifood.status, 'Sem lançamento', r.ifood.premio),
        com99 && linha('99food', 'média do mês', r.f99.valor !== null ? nota(r.f99.valor) : '—', r.f99.status, 'Sem lançamento', r.f99.premio))),
  });

  const cardNutri = card({
    titulo: 'Relatórios da Nutricionista', sub: '2 visitas por mês, cada uma com sua meta', publico: PUBLICO[r.nutri1.meta?.publico] ?? '—',
    tom: [r.nutri1.status, r.nutri2.status].includes('fora') ? 'fora' : null, premioValor: r.nutri1.premio + r.nutri2.premio,
    atingido: r.nutri1.premio > 0 && r.nutri2.premio > 0,
    corpo: el('div', {},
      el('p', { class: 'ind-meta' }, textoMeta(r.nutri1.meta, pct0) + ' Em cada visita.'),
      el('div', { class: 'ind-detail ind-detail-plain' },
        ['nutri1', 'nutri2'].map((k, i) => linha(`Visita ${i + 1}`, r[k].data ? `em ${dataBR(r[k].data)}` : 'ainda não lançada',
          r[k].valor !== null ? pct(r[k].valor) : '—', r[k].status, 'Sem lançamento', r[k].premio)))),
  });

  const e = r.erros;
  const cardErros = card({
    titulo: 'Erros', sub: rotuloMes(d.mes) === 'mês vigente' ? 'acumulado do mês vigente' : `acumulado de ${rotuloMes(d.mes)}`, publico: PUBLICO[e.meta?.publico] ?? '—', tom: e.status, premioValor: e.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-label' }, 'Percentual de erros'),
      el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, e.valor !== null ? pct(e.valor, 2) : '—'), selo(e.status, 'Sem lançamento')),
      el('p', { class: 'ind-meta' }, textoMeta(e.meta, (v) => pct(v, 1))),
      el('div', { class: 'ind-detail' },
        linha('Quantidade de erros', `de ${e.pedidos.toLocaleString('pt-BR')} pedidos no mês · ${e.dias} dia(s) lançado(s)`, e.dias ? e.qtd : '—')),
      el('div', { class: 'ind-cost-grid' },
        el('div', { class: 'ind-cost' }, el('p', { class: 'ind-cost-label' }, 'Custo dos erros — Cozinha'), el('p', { class: 'ind-cost-value' }, e.dias ? '− ' + reais(e.custoCozinha) : '—')),
        el('div', { class: 'ind-cost' }, el('p', { class: 'ind-cost-label' }, 'Custo dos erros — Atendimento'), el('p', { class: 'ind-cost-value' }, e.dias ? '− ' + reais(e.custoAtendimento) : '—'))),
      el('p', { class: 'ind-cost-note' }, 'descontado do incentivo, dividido entre as pessoas de cada setor da unidade')),
  });

  const limiteMin = Math.round((d.cozinha_limite_seg ?? 2400) / 60);
  // A seção em si não é um cartão (DESIGN.md); cada indicador é.
  conteudo.append(el('section', { class: 'sec-kpis' },
    cabecalho(titulo ?? 'Metas e avaliações', d.atualizado_ate ? `vendas até ${dataBR(d.atualizado_ate)}` : 'sem vendas ainda', 'alvo'),
    el('div', { class: 'ind-grid' },
      resumo,
      cardTempo('Aguardando entregador', r.aguardando, d.mes),
      cardTempo('Cozinha (entrega)', r.cozinha, d.mes,
        r.cozinha.excluidos ? `${r.cozinha.excluidos} pedido(s) acima de ${limiteMin} min fora da média` : 'entregas do mês'),
      cardCmv, cardNotas, cardNutri, cardErros)),
  );
}

export async function telaIndicadores(conteudo, ctx) {
  const mes = ctx.mes;
  const { data, error } = await supabase.rpc('indicadores_mes', { p_unidade: ctx.unidade.codigo, p_mes: mes });
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar o Desempenho: ' + error.message)));
    return;
  }
  renderizarIndicadores(conteudo, data, { titulo: `Metas e avaliações · ${ctx.unidade.nome}` });
}
