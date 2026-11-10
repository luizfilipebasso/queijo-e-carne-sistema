// Tela Metas (só o dono; dono, 10/11/2026): muda a meta, a super meta e os prêmios de cada indicador da unidade
// selecionada, sempre "a partir do mês tal" (mês atual ou o próximo), sem reescrever os meses anteriores.
// Ligar ou desligar um indicador numa unidade continua sendo por SQL (meta com início em 2099 = desligada).
import { supabase } from './supabase.js';
import { el, limpar, avisar } from './util.js';
import { hojeBrasil, dataBR } from './lancamentos.js';
import { nomeMes } from './meses.js';
import { reais, cabecalho } from './painel.js';
import { mmss } from './indicadores.js';

// Como cada indicador é digitado e mostrado: tempo (mm:ss, guardado em segundos), pct, nota, inteiro ou reais.
const INDICADORES = [
  ['aguardando', 'Tempo aguardando entregador', 'tempo'],
  ['cozinha', 'Tempo de cozinha / preparo', 'tempo'],
  ['erros', 'Erros', 'pct'],
  ['erros_cozinha', 'Erros da Cozinha', 'pct'],
  ['erros_atendimento', 'Erros do Atendimento', 'pct'],
  ['burgers', 'Burgers vendidos', 'inteiro'],
  ['cmv', 'CMV', 'pct'],
  ['ifood', 'Nota iFood', 'nota'],
  ['keeta', 'Nota Keeta', 'nota'],
  ['f99', 'Nota 99food', 'nota'],
  ['nutri', 'Nutricionista (cada visita)', 'pct'],
  ['ticket_balcao', 'Ticket médio Balcão (só referência)', 'reais'],
  ['ticket_delivery', 'Ticket médio Delivery (só referência)', 'reais'],
];
const PUBLICO = { todos: 'Todos', cozinha: 'Cozinha', atendimento: 'Atendimento', producao: 'Produção' };
const numeroBR = (v, casas) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const MOSTRAR = {
  tempo: (v) => mmss(Number(v)),
  pct: (v) => `${numeroBR(v, Number.isInteger(Number(v)) ? 0 : 2)}%`,
  nota: (v) => numeroBR(v, 2),
  inteiro: (v) => numeroBR(v, 0),
  reais: (v) => reais(v, 0),
};
const DICA = { tempo: 'min:seg, ex.: 07:30', pct: '%', nota: 'ex.: 4,90', inteiro: 'quantidade', reais: 'R$' };

// Texto digitado → número guardado no banco (null se não der para entender).
function ler(tipo, texto) {
  const t = texto.trim();
  if (tipo === 'tempo') {
    const m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  const limpo = t.replace(/[%R$\s]/g, '');
  // "7.000" é sete mil; "4.90" (sem vírgula, em campo com decimais) é quatro e noventa.
  const pontoDecimal = tipo !== 'inteiro' && !limpo.includes(',') && /^\d+\.\d{1,2}$/.test(limpo);
  const n = Number(pontoDecimal ? limpo : limpo.replace(/\./g, '').replace(',', '.'));
  if (limpo === '' || !Number.isFinite(n) || n < 0) return null;
  return tipo === 'inteiro' ? Math.round(n) : n;
}
const paraCampo = (tipo, v) => (v === null || v === undefined ? '' : tipo === 'tempo' ? mmss(Number(v)) : String(Number(v)).replace('.', ','));

export async function telaMetas(conteudo, ctx) {
  const unidade = ctx.unidade.codigo;
  const mesAtual = hojeBrasil().slice(0, 8) + '01';
  const [ano, mes] = mesAtual.split('-').map(Number);
  const proximoMes = `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, '0')}-01`;

  const { data: linhas, error } = await supabase.from('metas').select('*').eq('unidade', unidade).order('vale_a_partir_de');
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar as metas: ' + error.message)));
    return;
  }

  const cartao = ([chave, nome, tipo]) => {
    const doIndicador = linhas.filter((l) => l.indicador === chave);
    // Vale hoje: a mais recente que já começou. Agendada: a que começa no próximo mês (2099 = desligada, não entra).
    const atual = doIndicador.filter((l) => l.vale_a_partir_de <= mesAtual).pop();
    if (!atual) return null;
    const agendada = doIndicador.find((l) => l.vale_a_partir_de === proximoMes);
    const temPremio = atual.super_meta !== null;
    const mostrar = MOSTRAR[tipo];
    const resumo = (l) => (temPremio
      ? `Meta ${mostrar(l.meta)} (${reais(l.premio_meta, 0)}) · Super meta ${mostrar(l.super_meta)} (${reais(l.premio_super, 0)})`
      : `Meta ${mostrar(l.meta)}`);

    const campo = (rotulo, tipoCampo, valor) => {
      const entrada = el('input', { class: 'form-input', type: 'text', inputmode: tipoCampo === 'tempo' ? 'text' : 'decimal', value: paraCampo(tipoCampo, valor), placeholder: DICA[tipoCampo] });
      return { entrada, bloco: el('div', {}, el('label', { class: 'form-label' }, rotulo, entrada)) };
    };
    const meta = campo(`Meta (${DICA[tipo]})`, tipo, atual.meta);
    const superMeta = campo(`Super meta (${DICA[tipo]})`, tipo, atual.super_meta);
    const premioMeta = campo('Prêmio da meta (R$)', 'reais', atual.premio_meta);
    const premioSuper = campo('Prêmio da super meta (R$)', 'reais', atual.premio_super);
    const inicio = el('select', { class: 'form-input' },
      el('option', { value: mesAtual }, `${nomeMes(mesAtual)} (mês atual)`),
      el('option', { value: proximoMes, selected: true }, `${nomeMes(proximoMes)} (próximo mês)`));

    const formulario = el('form', { class: 'meta-form', hidden: true },
      el('div', { class: 'form-row-pair form-row' }, meta.bloco, temPremio && superMeta.bloco),
      temPremio && el('div', { class: 'form-row-pair form-row' }, premioMeta.bloco, premioSuper.bloco),
      el('div', { class: 'form-row' }, el('label', { class: 'form-label' }, 'Vale a partir de', inicio)),
      el('p', { class: 'et-dica' }, 'Os meses anteriores não mudam. Mês já fechado continua com os valores gravados no fechamento.'),
      el('button', { type: 'submit', class: 'btn-primary' }, 'Salvar'));
    const botao = el('button', { type: 'button', class: 'btn-sec', onclick: () => { formulario.hidden = !formulario.hidden; } }, 'Alterar');

    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const nova = {
        unidade, indicador: chave, vale_a_partir_de: inicio.value, maior_melhor: atual.maior_melhor, publico: atual.publico,
        meta: ler(tipo, meta.entrada.value),
        super_meta: temPremio ? ler(tipo, superMeta.entrada.value) : null,
        premio_meta: temPremio ? ler('reais', premioMeta.entrada.value) : atual.premio_meta,
        premio_super: temPremio ? ler('reais', premioSuper.entrada.value) : atual.premio_super,
      };
      if (nova.meta === null || (temPremio && [nova.super_meta, nova.premio_meta, nova.premio_super].includes(null))) {
        return avisar(tipo === 'tempo' ? 'Confira os valores. O tempo é no formato min:seg, por exemplo 07:30.' : 'Confira os valores digitados.', 'erro');
      }
      // A super meta é sempre mais difícil (ou igual) que a meta, e paga pelo menos o mesmo.
      if (temPremio && (atual.maior_melhor ? nova.super_meta < nova.meta : nova.super_meta > nova.meta)) {
        return avisar(`A super meta precisa ser ${atual.maior_melhor ? 'maior' : 'menor'} ou igual à meta.`, 'erro');
      }
      if (temPremio && nova.premio_super < nova.premio_meta) return avisar('O prêmio da super meta não pode ser menor que o da meta.', 'erro');
      const texto = `${nome} em ${ctx.unidade.nome}, a partir de ${nomeMes(nova.vale_a_partir_de).toLowerCase()}:\n\n${resumo(nova)}\n\nConfirmar?`;
      if (!confirm(texto)) return;
      const { error: erro } = await supabase.from('metas').upsert(nova, { onConflict: 'unidade,indicador,vale_a_partir_de' });
      if (erro) return avisar('Não foi possível salvar: ' + erro.message, 'erro');
      avisar('Meta salva.');
      limpar(conteudo);
      telaMetas(conteudo, ctx);
    });

    return el('div', { class: 'meta-item' },
      el('div', { class: 'pessoa-row' },
        el('div', { class: 'pessoa-info' },
          el('div', { class: 'pessoa-nome' }, nome, temPremio && el('span', { class: 'tag-inline' }, atual.publico.split(',').map((p) => PUBLICO[p] ?? p).join(' e '))),
          el('div', { class: 'pessoa-meta' }, `${resumo(atual)} · desde ${dataBR(atual.vale_a_partir_de).slice(3)}`),
          agendada && el('div', { class: 'pessoa-meta meta-agendada' }, `A partir de ${nomeMes(proximoMes).toLowerCase()}: ${resumo(agendada)}`)),
        botao),
      formulario);
  };

  conteudo.append(el('section', {},
    cabecalho(`Metas e prêmios · ${ctx.unidade.nome}`, 'valores que valem hoje', 'alvo'),
    el('p', { class: 'section-desc' },
      'Só aparecem os indicadores ligados nesta unidade. Para ligar ou desligar um indicador, ou mudar quem recebe, fale com quem cuida do sistema.'),
    INDICADORES.map(cartao)));
}
