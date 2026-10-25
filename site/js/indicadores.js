// Tela Indicadores (todos): metas, super metas e prêmios do mês, da unidade selecionada.
// As metas e os prêmios vêm do banco (tabela metas, por unidade); veja CLAUDE.md.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { dataBR } from './lancamentos.js';
import { rotuloMes } from './meses.js';
import { pct, reais, cabecalho } from './painel.js';

const ROTULO_STATUS = { super: 'Super meta', meta: 'Na meta', fora: 'Fora da meta' };
// Indicadores que dão prêmio. As duas visitas da nutricionista usam a mesma meta ("nutri").
// Erros: em SM, um indicador por setor (erros_cozinha / erros_atendimento); em SP, um só ("erros", para todos).
// Cada unidade só usa os indicadores com meta valendo no mês (dono, 08/10/2026).
const PREMIADOS = ['aguardando', 'cozinha', 'cmv', 'ifood', 'keeta', 'f99', 'nutri1', 'nutri2', 'erros', 'erros_cozinha', 'erros_atendimento', 'burgers'];
const SETORES = ['cozinha', 'atendimento'];
const ROTULO_SETOR = { cozinha: 'Cozinha', atendimento: 'Atendimento', producao: 'Produção' };
const metaDe = (metas, chave) => metas[chave.startsWith('nutri') ? 'nutri' : chave];
// "publico" da meta: 'todos' (= Cozinha e Atendimento) ou lista de setores, ex.: 'cozinha,producao'.
// A Produção só recebe o que a cita pelo nome: hoje, só a Nutricionista (dono, 25/10/2026).
const setoresDe = (m) => (!m?.publico ? [] : m.publico === 'todos' ? SETORES : m.publico.split(','));
const paraSetor = (m, setor) => setoresDe(m).includes(setor);

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

// Projeção de burgers para o fim do mês (dono, 25/10/2026): média por dia até o último dia com vendas × dias do mês.
// Só no mês em andamento; conta simples, sem IA.
const DIA_PROJECAO_VALE = 15;
function projetarBurgers(d, valor) {
  if (d.mes_encerrado || !valor || !d.atualizado_ate) return null;
  const dia = Number(d.atualizado_ate.slice(8, 10));
  const [ano, mes] = d.mes.split('-').map(Number);
  const diasMes = new Date(ano, mes, 0).getDate();
  if (dia <= 0 || dia >= diasMes) return null;
  const porDia = valor / dia;
  return { dia, porDia, total: Math.round(porDia * diasMes) };
}
const ORDEM_STATUS = { fora: 0, meta: 1, super: 2 };

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
  r.aguardando = {
    valor: num(d.aguardando?.segundos), pedidos: d.aguardando?.pedidos ?? 0,
    excluidos: d.aguardando?.excluidos ?? 0, limiteSeg: d.aguardando?.limite_seg ?? null,
  };
  r.cozinha = { valor: num(d.cozinha?.segundos), pedidos: d.cozinha?.pedidos ?? 0, excluidos: d.cozinha?.excluidos ?? 0 };
  r.cmv = { valor: media(d.cmv.map((q) => num(q.cmv_pct)).filter((v) => v !== null)), quinzenas: d.cmv };
  r.ifood = { valor: media(d.notas.map((n) => num(n.nota_ifood)).filter((v) => v !== null)) };
  r.f99 = { valor: media(d.notas.map((n) => num(n.nota_99food)).filter((v) => v !== null)) };
  r.keeta = { valor: media(d.notas.map((n) => num(n.nota_keeta)).filter((v) => v !== null)) };
  // Burgers vendidos no mês (avulsos + dentro de combos; só SM tem meta, desde outubro de 2026).
  r.burgers = { valor: num(d.burgers_vendidos) };
  for (const v of [1, 2]) {
    const visita = d.nutri.find((n) => n.visita === v);
    r[`nutri${v}`] = { valor: num(visita?.nota), data: visita?.data };
  }
  // Percentual de erros de cada setor = erros do setor no mês ÷ total de pedidos do mês.
  const e = d.erros;
  for (const setor of SETORES) {
    const qtd = Number(e[`qtd_${setor}`]);
    r[`erros_${setor}`] = {
      valor: e.dias_lancados > 0 && d.pedidos > 0 ? (qtd / d.pedidos) * 100 : null,
      qtd, dias: e.dias_lancados, pedidos: d.pedidos, custo: Number(e[`custo_${setor}`]),
      pessoas: d.funcionarios?.[setor] ?? 0,
    };
  }
  // Erros num indicador só (SP): soma tudo que foi lançado; o custo se divide entre as pessoas dos dois setores.
  const qtdTotal = Number(e.qtd_cozinha) + Number(e.qtd_atendimento) + Number(e.qtd_geral ?? 0);
  r.erros = {
    valor: e.dias_lancados > 0 && d.pedidos > 0 ? (qtdTotal / d.pedidos) * 100 : null,
    qtd: qtdTotal, dias: e.dias_lancados, pedidos: d.pedidos,
    custo: Number(e.custo_cozinha) + Number(e.custo_atendimento) + Number(e.custo_geral ?? 0),
    pessoas: SETORES.reduce((s, x) => s + (d.funcionarios?.[x] ?? 0), 0),
  };
  r.errosUnificado = Boolean(metas.erros);
  for (const chave of PREMIADOS) {
    const item = r[chave];
    item.meta = metaDe(metas, chave);
    // O CMV só vale para prêmio com o mês fechado (as duas quinzenas lançadas e o mês encerrado).
    item.status = avaliar(item.meta, chave === 'cmv' && !d.mes_fechado ? null : item.valor);
    item.statusPrevia = avaliar(item.meta, item.valor);
    item.premio = premio(item.meta, item.status);
    item.premioPrevia = premio(item.meta, item.statusPrevia);
  }
  // Burgers: a partir do dia 15, se a projeção do mês já bate a meta ou a super meta, a prévia mostra
  // esse resultado e o prêmio dele, para a equipe ter ideia do que vai ganhar (dono, 25/10/2026).
  const b = r.burgers;
  b.projecao = projetarBurgers(d, b.valor);
  const stProj = b.projecao && b.projecao.dia >= DIA_PROJECAO_VALE ? avaliar(b.meta, b.projecao.total) : null;
  if (stProj && stProj !== 'fora' && ORDEM_STATUS[stProj] > ORDEM_STATUS[b.statusPrevia ?? 'fora']) {
    b.statusProjecao = stProj;
    b.statusPrevia = stProj;
    b.premioPrevia = premio(b.meta, stProj);
  }
  // Prêmio por pessoa de um setor: indicadores "todos" + o do setor.
  r.premioSetor = (setor, previa = false) => PREMIADOS
    .filter((k) => paraSetor(r[k].meta, setor))
    .reduce((s, k) => s + (previa ? r[k].premioPrevia : r[k].premio), 0);
  // Desconto por pessoa: custo dos erros do setor ÷ pessoas do setor (SP: custo total ÷ pessoas dos dois setores).
  r.errosDe = (setor) => (r.errosUnificado ? r.erros : r[`erros_${setor}`]);
  // A Produção não entra na divisão dos erros: sem desconto.
  r.descontoSetor = (setor) => {
    if (setor === 'producao') return 0;
    const x = r.errosDe(setor);
    return x.pessoas > 0 ? x.custo / x.pessoas : 0;
  };
  // Incentivo por pessoa = prêmios − desconto, nunca abaixo de zero.
  r.incentivoSetor = (setor, previa = false) => Math.max(0, r.premioSetor(setor, previa) - r.descontoSetor(setor));
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

const ROTULO_PUBLICO = { todos: 'Todos', cozinha: 'Cozinha', atendimento: 'Atendimento', producao: 'Produção' };
const rotuloPublico = (m) => (m?.publico ? m.publico.split(',').map((x) => ROTULO_PUBLICO[x] ?? x).join(' e ') : '—');

function cardTempo(titulo, item, mes, extra, quais = 'só entregas') {
  const m = item.meta;
  const diferenca = item.valor !== null && m ? Math.round(item.valor - m.meta) : null;
  return card({
    titulo, sub: `${quais}, ${rotuloMes(mes)}, sem fiado`, publico: rotuloPublico(m), tom: item.status, premioValor: item.premio,
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

// "setor" (funcionário de Cozinha, Atendimento ou Produção): mostra só os cartões e o prêmio do próprio setor + os de todos
// (dono, 25/10/2026). Sem setor (dono, gerente, setor ainda não informado), mostra tudo.
export function renderizarIndicadores(conteudo, d, { titulo, setor = null } = {}) {
  const r = calcular(d);
  const previa = !d.mes_fechado;

  // Resumo de prêmios por setor: cartão em toda a largura no topo da grade, já com o desconto dos erros.
  const blocoSetor = (setor) => {
    const x = setor === 'producao' ? { custo: 0 } : r.errosDe(setor);
    const bruto = r.premioSetor(setor, previa);
    const desconto = r.descontoSetor(setor);
    const liquido = r.incentivoSetor(setor, previa);
    const detalhe = x.custo > 0
      ? `${reais(bruto, 0)} em prêmios − ${reais(desconto)} de erros (${reais(x.custo)} ÷ ${x.pessoas} pessoa${x.pessoas === 1 ? '' : 's'})`
      : `${reais(bruto, 0)} em prêmios · sem desconto de erros`;
    return el('div', {},
      el('p', { class: 'stat-sub' }, `Prêmio por pessoa — ${ROTULO_SETOR[setor]}`),
      el('p', { class: 'stat-value' }, reais(liquido, Number.isInteger(liquido) ? 0 : 2)),
      el('p', { class: 'stat-sub' }, detalhe));
  };
  const resumo = el('div', { class: 'ind-card ind-resumo' },
    setor ? blocoSetor(setor) : el('div', { class: 'grid-3' }, blocoSetor('cozinha'), blocoSetor('atendimento'), blocoSetor('producao')),
    previa && el('p', { class: 'aviso ind-previa' }, 'Prévia: o mês ainda não fechou.'),
  );

  const nomeQuinzena = (inicio) => (inicio.endsWith('-01') ? '1ª quinzena' : '2ª quinzena');
  const pct0 = (v) => pct(v, 0);
  // Antes do mês fechar, o cartão já mostra o resultado da média parcial (meta/super meta e o prêmio
  // equivalente), marcado como parcial, para motivar a equipe (dono, 25/10/2026). O definitivo vale no fechamento.
  const cmvParcial = !r.cmv.status && Boolean(r.cmv.statusPrevia);
  const cmvStatus = r.cmv.status ?? r.cmv.statusPrevia;
  const cmvPremio = r.cmv.status ? r.cmv.premio : r.cmv.premioPrevia;
  const cardCmv = card({
    titulo: 'CMV', sub: 'média das 2 quinzenas; vale com o mês fechado', publico: rotuloPublico(r.cmv.meta), tom: cmvStatus, premioValor: cmvPremio,
    corpo: el('div', {},
      el('p', { class: 'ind-label' }, d.mes_fechado ? 'Mês fechado' : 'Média parcial'),
      el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, r.cmv.valor !== null ? pct(r.cmv.valor) : '—'),
        cmvParcial
          ? el('span', { class: `kpi-status ${cmvStatus}` }, `${ROTULO_STATUS[cmvStatus]} (parcial)`)
          : selo(r.cmv.status, r.cmv.valor === null ? 'Sem lançamento' : 'Aguardando fechamento')),
      el('p', { class: 'ind-meta' }, textoMeta(r.cmv.meta, pct0)),
      cmvParcial && el('p', { class: 'ind-cost-note' },
        cmvPremio > 0
          ? `Pela média parcial, hoje vale + ${reais(cmvPremio, 0)} por pessoa. Fica definitivo quando as duas quinzenas forem lançadas e o mês terminar.`
          : 'Pela média parcial, hoje ainda não bate a meta. Fica definitivo quando as duas quinzenas forem lançadas e o mês terminar.'),
      el('div', { class: 'ind-detail' },
        r.cmv.quinzenas.length
          ? r.cmv.quinzenas.map((q) => linha(nomeQuinzena(q.inicio), `a partir de ${dataBR(q.inicio)}`, q.cmv_pct !== null ? pct(q.cmv_pct) : '—'))
          : el('p', { class: 'ind-empty' }, 'Nenhuma quinzena lançada neste mês.'))),
  });

  const nota = (v) => fmt(v, 2);
  // Plataformas com meta valendo no mês: SM só iFood (99food ainda não vale); SP iFood, Keeta e 99food (dono, 08/10/2026).
  const plataformas = [['iFood', r.ifood], ['Keeta', r.keeta], ['99food', r.f99]].filter(([, p]) => p.meta);
  const cardNotas = card({
    titulo: plataformas.length > 1 ? 'Notas das plataformas' : 'Nota do iFood', sub: 'média das quinzenas do mês', publico: rotuloPublico(r.ifood.meta),
    tom: plataformas.some(([, p]) => p.status === 'fora') ? 'fora' : null, premioValor: plataformas.reduce((s, [, p]) => s + p.premio, 0),
    atingido: plataformas.every(([, p]) => p.premio > 0),
    corpo: el('div', {},
      el('p', { class: 'ind-meta' }, textoMeta(r.ifood.meta, nota) + (plataformas.length > 1 ? ' Para cada plataforma.' : '')),
      el('div', { class: 'ind-detail ind-detail-plain' },
        plataformas.map(([nome, p]) => linha(nome, 'média do mês', p.valor !== null ? nota(p.valor) : '—', p.status, 'Sem lançamento', p.premio)))),
  });

  const cardNutri = card({
    titulo: 'Relatórios da Nutricionista', sub: '2 visitas por mês, cada uma com sua meta', publico: rotuloPublico(r.nutri1.meta),
    tom: [r.nutri1.status, r.nutri2.status].includes('fora') ? 'fora' : null, premioValor: r.nutri1.premio + r.nutri2.premio,
    atingido: r.nutri1.premio > 0 && r.nutri2.premio > 0,
    corpo: el('div', {},
      el('p', { class: 'ind-meta' }, textoMeta(r.nutri1.meta, pct0) + ' Em cada visita.'),
      el('div', { class: 'ind-detail ind-detail-plain' },
        ['nutri1', 'nutri2'].map((k, i) => linha(`Visita ${i + 1}`, r[k].data ? `em ${dataBR(r[k].data)}` : 'ainda não lançada',
          r[k].valor !== null ? pct(r[k].valor) : '—', r[k].status, 'Sem lançamento', r[k].premio)))),
  });

  // setor null = erros num indicador só (SP).
  const cardErros = (setor) => {
    const e = setor ? r[`erros_${setor}`] : r.erros;
    const quem = setor ? `de ${ROTULO_SETOR[setor]}` : 'da Cozinha e do Atendimento';
    return card({
      titulo: setor ? `Erros ${ROTULO_SETOR[setor].toLowerCase()}` : 'Erros',
      sub: rotuloMes(d.mes) === 'mês vigente' ? 'acumulado do mês vigente' : `acumulado de ${rotuloMes(d.mes)}`,
      publico: rotuloPublico(e.meta), tom: e.status, premioValor: e.premio,
      corpo: el('div', {},
        el('p', { class: 'ind-label' }, 'Percentual de erros'),
        el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, e.valor !== null ? pct(e.valor, 2) : '—'), selo(e.status, 'Sem lançamento')),
        el('p', { class: 'ind-meta' }, textoMeta(e.meta, (v) => pct(v, 1))),
        el('div', { class: 'ind-detail' },
          linha('Quantidade de erros', `de ${e.pedidos.toLocaleString('pt-BR')} pedidos no mês · ${e.dias} dia(s) lançado(s)`, e.dias ? e.qtd : '—')),
        el('div', { class: 'ind-cost-grid' },
          el('div', { class: 'ind-cost' }, el('p', { class: 'ind-cost-label' }, 'Custo dos erros'),
            el('p', { class: 'ind-cost-value' }, e.dias ? '− ' + reais(e.custo) : '—')),
          el('div', { class: 'ind-cost' }, el('p', { class: 'ind-cost-label' }, 'Desconto por pessoa'),
            el('p', { class: 'ind-cost-value' }, e.custo > 0 && e.pessoas > 0 ? '− ' + reais(e.custo / e.pessoas) : '—'))),
        el('p', { class: 'ind-cost-note' }, `custo dividido entre ${e.pessoas} pessoa(s) ${quem} da unidade no mês; já descontado do prêmio lá em cima`)),
    });
  };

  const inteiroBR = (v) => Math.round(Number(v)).toLocaleString('pt-BR');
  const cardBurgers = () => {
    const b = r.burgers;
    const m = b.meta;
    const falta = (alvo) => (b.valor === null ? '—' : b.valor >= alvo ? 'batida' : inteiroBR(alvo - b.valor));
    let projecao = null;
    if (b.projecao) {
      const { porDia, total } = b.projecao;
      const resultado = !m ? ''
        : total >= Number(m.super_meta) ? ', o que bate a super meta.'
        : total >= Number(m.meta) ? ', o que bate a meta.'
        : `; faltariam ${inteiroBR(Number(m.meta) - total)} para a meta.`;
      projecao = el('p', { class: 'ind-projecao' },
        `Pela média diária (≈ ${inteiroBR(porDia)} por dia), até o fim do mês serão cerca de `,
        el('strong', {}, `${inteiroBR(total)} burgers`), resultado || '.',
        b.statusProjecao && ` Se continuar assim, vale + ${reais(b.premioPrevia, 0)} por pessoa (prévia; o definitivo é o total do mês).`);
    }
    // Resultado pela projeção (a partir do dia 15): mesmo jeito do CMV parcial.
    const tom = b.statusProjecao ?? b.status;
    return card({
      titulo: 'Burgers vendidos',
      sub: rotuloMes(d.mes) === 'mês vigente' ? 'acumulado do mês vigente' : `acumulado de ${rotuloMes(d.mes)}`,
      publico: rotuloPublico(m), tom, premioValor: b.statusProjecao ? b.premioPrevia : b.premio,
      corpo: el('div', {},
        el('p', { class: 'ind-label' }, 'Avulsos + dentro de combos'),
        el('div', { class: 'ind-valuerow' }, el('p', { class: 'ind-value' }, b.valor !== null ? inteiroBR(b.valor) : '—'),
          b.statusProjecao
            ? el('span', { class: `kpi-status ${tom}` }, `${ROTULO_STATUS[tom]} (projeção)`)
            : selo(b.status, 'Sem dados')),
        el('p', { class: 'ind-meta' }, textoMeta(m, inteiroBR)),
        projecao,
        el('div', { class: 'ind-detail' },
          linha('Faltam para a meta', m ? `meta de ${inteiroBR(m.meta)}` : '', m ? falta(Number(m.meta)) : '—'),
          linha('Faltam para a super meta', m ? `super meta de ${inteiroBR(m.super_meta)}` : '', m ? falta(Number(m.super_meta)) : '—'))),
    });
  };

  const limiteMin = Math.round((d.cozinha_limite_seg ?? 2400) / 60);
  // SP: cozinha com entregas, balcão e salão; sem "aguardando entregador"; erros num cartão só.
  const cozinhaTodos = Boolean(d.cozinha_todos_os_tipos);
  const quaisCozinha = cozinhaTodos ? 'pedidos do mês' : 'entregas do mês';
  // A seção em si não é um cartão (DESIGN.md); cada indicador é.
  // Cartão visível para quem está vendo: indicador de todos, do próprio setor, ou sem setor definido (vê tudo).
  const ve = (m) => !setor || !m || paraSetor(m, setor);
  conteudo.append(el('section', { class: 'sec-kpis' },
    cabecalho(titulo ?? 'Metas e avaliações', d.atualizado_ate ? `vendas até ${dataBR(d.atualizado_ate)}` : 'sem vendas ainda', 'alvo'),
    el('div', { class: 'ind-grid' },
      resumo,
      r.aguardando.meta && ve(r.aguardando.meta) && cardTempo('Tempo Aguardando Entregador', r.aguardando, d.mes,
        r.aguardando.excluidos ? `${r.aguardando.excluidos} pedido(s) acima de ${Math.round(r.aguardando.limiteSeg / 60)} min fora da média` : 'entregas do mês'),
      ve(r.cozinha.meta) && cardTempo(cozinhaTodos ? 'Tempo de preparo' : 'Tempo de Produção na Cozinha', r.cozinha, d.mes,
        r.cozinha.excluidos ? `${r.cozinha.excluidos} pedido(s) acima de ${limiteMin} min fora da média` : quaisCozinha,
        cozinhaTodos ? 'entregas, balcão e salão' : 'só entregas'),
      ...(r.errosUnificado ? [ve(r.erros.meta) && cardErros(null)] : ['atendimento', 'cozinha'].filter((x) => ve(r[`erros_${x}`].meta)).map(cardErros)),
      r.burgers.meta && ve(r.burgers.meta) && cardBurgers(),
      ve(r.cmv.meta) && cardCmv, ve(r.ifood.meta) && cardNotas, ve(r.nutri1.meta) && cardNutri)),
  );
}

export async function telaIndicadores(conteudo, ctx) {
  const mes = ctx.mes;
  const { data, error } = await supabase.rpc('indicadores_mes', { p_unidade: ctx.unidade.codigo, p_mes: mes });
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar o Desempenho: ' + error.message)));
    return;
  }
  const setor = ctx.papel === 'funcionario' ? (ctx.vinculo?.setor ?? ctx.vinculo?.setor_indicado ?? null) : null;
  renderizarIndicadores(conteudo, data, { titulo: `Metas e avaliações · ${ctx.unidade.nome}`, setor: ['cozinha', 'atendimento', 'producao'].includes(setor) ? setor : null });
}
