// Tela Indicadores (todos): metas, super metas e prêmios do mês.
// Regras e valores: CLAUDE.md, seção "Indicadores, metas e incentivos".
import { supabase } from './supabase.js';
import { el } from './util.js';
import { hojeBrasil, dataBR } from './lancamentos.js';
import { pct, reais, cabecalho } from './painel.js';

// Metas: [meta, super meta, maior é melhor?, prêmio na meta, prêmio na super meta, quem recebe]
export const METAS = {
  aguardando: [180, 120, false, 50, 100, 'atendimento'],
  cozinha: [360, 300, false, 50, 100, 'cozinha'],
  cmv: [34, 32, false, 50, 100, 'todos'],
  ifood: [4.9, 5.0, true, 25, 50, 'todos'],
  f99: [4.9, 5.0, true, 25, 50, 'todos'],
  nutri1: [90, 95, true, 25, 50, 'todos'],
  nutri2: [90, 95, true, 25, 50, 'todos'],
  erros: [1.5, 0.8, false, 50, 100, 'todos'],
};

const ROTULO_STATUS = { super: 'Super meta', meta: 'Na meta', fora: 'Fora da meta' };

export function avaliar(chave, valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
  const [meta, sup, maiorMelhor] = METAS[chave];
  if (maiorMelhor) return valor >= sup ? 'super' : valor >= meta ? 'meta' : 'fora';
  return valor <= sup ? 'super' : valor <= meta ? 'meta' : 'fora';
}

export function premio(chave, status) {
  const [, , , pMeta, pSuper] = METAS[chave];
  return status === 'super' ? pSuper : status === 'meta' ? pMeta : 0;
}

const media = (lista) => (lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const fmt = (n, casas) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function selo(status, pendente) {
  return el('span', { class: 'kpi-status ' + (status ?? 'pending') }, status ? ROTULO_STATUS[status] : pendente);
}
function recompensa(valor) {
  return valor > 0 ? el('span', { class: 'ind-reward' }, `+ R$ ${valor}`) : null;
}

// Calcula tudo a partir do retorno de indicadores_mes. Reaproveitado pelo Histórico e pelo incentivo.
export function calcular(d) {
  const r = {};
  r.aguardando = { valor: num(d.aguardando?.segundos), pedidos: d.aguardando?.pedidos ?? 0 };
  r.cozinha = { valor: num(d.cozinha?.segundos), pedidos: d.cozinha?.pedidos ?? 0, excluidos: d.cozinha?.excluidos ?? 0 };
  const cmvs = d.cmv.map((q) => num(q.cmv_pct)).filter((v) => v !== null);
  r.cmv = { valor: media(cmvs), quinzenas: d.cmv, fechado: d.mes_fechado };
  r.ifood = { valor: media(d.notas.map((n) => num(n.nota_ifood)).filter((v) => v !== null)) };
  r.f99 = { valor: media(d.notas.map((n) => num(n.nota_99food)).filter((v) => v !== null)) };
  r.nutri1 = { valor: num(d.nutri.find((n) => n.visita === 1)?.nota), data: d.nutri.find((n) => n.visita === 1)?.data };
  r.nutri2 = { valor: num(d.nutri.find((n) => n.visita === 2)?.nota), data: d.nutri.find((n) => n.visita === 2)?.data };
  const e = d.erros;
  const qtdErros = e.qtd_cozinha + e.qtd_atendimento;
  r.erros = {
    valor: e.dias_lancados > 0 && d.pedidos > 0 ? (qtdErros / d.pedidos) * 100 : null,
    qtd: qtdErros, dias: e.dias_lancados, pedidos: d.pedidos,
    custoCozinha: Number(e.custo_cozinha), custoAtendimento: Number(e.custo_atendimento),
  };
  for (const [chave, item] of Object.entries(r)) {
    // O CMV só vale para prêmio com o mês fechado (as duas quinzenas lançadas e o mês encerrado).
    item.status = avaliar(chave, chave === 'cmv' && !d.mes_fechado ? null : item.valor);
    item.statusPrevia = avaliar(chave, item.valor);
    item.premio = premio(chave, item.status);
  }
  r.premioSetor = (setor) => Object.entries(METAS)
    .filter(([, m]) => m[5] === 'todos' || m[5] === setor)
    .reduce((s, [chave]) => s + r[chave].premio, 0);
  return r;
}

function card({ titulo, sub, publico, tom, premioValor, corpo }) {
  return el('div', { class: `ind-card${tom ? ' tone-' + tom : ''}${premioValor > 0 ? ' reached' : ''}${tom === 'super' ? ' reached-super' : ''}` },
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

function cardTempo(chave, titulo, publico, item, extra) {
  const [meta, sup] = METAS[chave];
  const diferenca = item.valor !== null ? Math.round(item.valor - meta) : null;
  return card({
    titulo, sub: 'só entregas, mês vigente, sem fiado', publico, tom: item.status, premioValor: item.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-label' }, 'Tempo médio'),
      el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, item.valor !== null ? mmss(item.valor) : '—'), selo(item.status, 'Sem dados')),
      el('p', { class: 'ind-meta' }, `Meta até ${mmss(meta)} (R$ ${METAS[chave][3]}). Super meta até ${mmss(sup)} (R$ ${METAS[chave][4]}).`),
      el('div', { class: 'ind-detail' },
        linha('Diferença para a meta', `meta de ${mmss(meta)}`,
          diferenca === null ? '—' : diferenca === 0 ? '0s' : `${diferenca > 0 ? '+' : '−'}${mmss(Math.abs(diferenca))}`),
        linha('Pedidos considerados', extra ?? 'entregas do mês', item.pedidos.toLocaleString('pt-BR')))),
  });
}

export function renderizarIndicadores(conteudo, d, { titulo } = {}) {
  const r = calcular(d);
  const prevSetor = (setor) => Object.entries(METAS)
    .filter(([, m]) => m[5] === 'todos' || m[5] === setor)
    .reduce((s, [chave]) => s + premio(chave, r[chave].statusPrevia), 0);

  const resumo = el('section', {},
    cabecalho(titulo ?? 'Metas e avaliações', d.atualizado_ate ? `vendas até ${dataBR(d.atualizado_ate)}` : null),
    el('div', { class: 'grid-2' },
      el('div', {}, el('p', { class: 'stat-sub' }, 'Prêmios — Cozinha'), el('p', { class: 'stat-value' }, reais(d.mes_fechado ? r.premioSetor('cozinha') : prevSetor('cozinha'), 0)),
        el('p', { class: 'stat-sub' }, 'por pessoa, antes do desconto dos erros')),
      el('div', {}, el('p', { class: 'stat-sub' }, 'Prêmios — Atendimento'), el('p', { class: 'stat-value' }, reais(d.mes_fechado ? r.premioSetor('atendimento') : prevSetor('atendimento'), 0)),
        el('p', { class: 'stat-sub' }, 'por pessoa, antes do desconto dos erros'))),
    !d.mes_fechado && el('p', { class: 'aviso', style: 'margin-top:14px' },
      'Prévia: o mês ainda não fechou. O CMV entra no cálculo quando as duas quinzenas estiverem lançadas e o mês terminar.'),
  );

  const nomeQuinzena = (inicio) => (inicio.endsWith('-01') ? '1ª quinzena' : '2ª quinzena');
  const cardCmv = card({
    titulo: 'CMV', sub: 'média das 2 quinzenas; vale com o mês fechado', publico: 'Todos', tom: r.cmv.status, premioValor: r.cmv.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-label' }, d.mes_fechado ? 'Mês fechado' : 'Média parcial'),
      el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, r.cmv.valor !== null ? pct(r.cmv.valor) : '—'),
        selo(r.cmv.status, r.cmv.valor === null ? 'Sem lançamento' : 'Aguardando fechamento')),
      el('p', { class: 'ind-meta' }, 'Meta até 34% (R$ 50). Super meta até 32% (R$ 100).'),
      el('div', { class: 'ind-detail' },
        r.cmv.quinzenas.length
          ? r.cmv.quinzenas.map((q) => linha(nomeQuinzena(q.inicio), `a partir de ${dataBR(q.inicio)}`, q.cmv_pct !== null ? pct(q.cmv_pct) : '—'))
          : el('p', { class: 'ind-empty' }, 'Nenhuma quinzena lançada neste mês.'))),
  });

  const cardNotas = card({
    titulo: 'Notas das plataformas', sub: 'média das quinzenas do mês', publico: 'Todos',
    tom: [r.ifood.status, r.f99.status].includes('fora') ? 'fora' : null, premioValor: r.ifood.premio + r.f99.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-meta' }, 'Meta 4,90 (R$ 25) e super meta 5,00 (R$ 50), para cada plataforma.'),
      el('div', { class: 'ind-detail ind-detail-plain' },
        linha('iFood', 'média do mês', r.ifood.valor !== null ? fmt(r.ifood.valor, 2) : '—', r.ifood.status, 'Sem lançamento', r.ifood.premio),
        linha('99food', 'média do mês', r.f99.valor !== null ? fmt(r.f99.valor, 2) : '—', r.f99.status, 'Sem lançamento', r.f99.premio))),
  });

  const cardNutri = card({
    titulo: 'Relatórios da Nutricionista', sub: '2 visitas por mês, cada uma com sua meta', publico: 'Todos',
    tom: [r.nutri1.status, r.nutri2.status].includes('fora') ? 'fora' : null, premioValor: r.nutri1.premio + r.nutri2.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-meta' }, 'Meta ≥ 90% (R$ 25) e super meta ≥ 95% (R$ 50), em cada visita.'),
      el('div', { class: 'ind-detail ind-detail-plain' },
        ['nutri1', 'nutri2'].map((k, i) => linha(`Visita ${i + 1}`, r[k].data ? `em ${dataBR(r[k].data)}` : 'ainda não lançada',
          r[k].valor !== null ? pct(r[k].valor) : '—', r[k].status, 'Sem lançamento', r[k].premio)))),
  });

  const e = r.erros;
  const cardErros = card({
    titulo: 'Erros', sub: 'acumulado do mês vigente', publico: 'Todos', tom: e.status, premioValor: e.premio,
    corpo: el('div', {},
      el('p', { class: 'ind-label' }, 'Percentual de erros'),
      el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, e.valor !== null ? pct(e.valor, 2) : '—'), selo(e.status, 'Sem lançamento')),
      el('p', { class: 'ind-meta' }, 'Meta até 1,5% (R$ 50). Super meta até 0,8% (R$ 100).'),
      el('div', { class: 'ind-detail' },
        linha('Quantidade de erros', `de ${e.pedidos.toLocaleString('pt-BR')} pedidos no mês · ${e.dias} dia(s) lançado(s)`, e.dias ? e.qtd : '—')),
      el('div', { class: 'ind-cost-grid' },
        el('div', { class: 'ind-cost' }, el('p', { class: 'ind-cost-label' }, 'Custo dos erros — Cozinha'), el('p', { class: 'ind-cost-value' }, e.dias ? '− ' + reais(e.custoCozinha) : '—')),
        el('div', { class: 'ind-cost' }, el('p', { class: 'ind-cost-label' }, 'Custo dos erros — Atendimento'), el('p', { class: 'ind-cost-value' }, e.dias ? '− ' + reais(e.custoAtendimento) : '—'))),
      el('p', { class: 'ind-cost-note' }, 'descontado do incentivo, dividido entre as pessoas de cada setor')),
  });

  conteudo.append(
    resumo,
    el('section', {}, el('div', { class: 'ind-grid' },
      cardTempo('aguardando', 'Aguardando entregador', 'Atendimento', r.aguardando),
      cardTempo('cozinha', 'Cozinha (entrega)', 'Cozinha', r.cozinha,
        r.cozinha.excluidos ? `${r.cozinha.excluidos} pedido(s) acima de 40 min fora da média` : 'entregas do mês'),
      cardCmv, cardNotas, cardNutri, cardErros)),
  );
}

export async function telaIndicadores(conteudo) {
  const mes = hojeBrasil().slice(0, 8) + '01';
  const { data, error } = await supabase.rpc('indicadores_mes', { p_mes: mes });
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar os Indicadores: ' + error.message)));
    return;
  }
  renderizarIndicadores(conteudo, data);
}
