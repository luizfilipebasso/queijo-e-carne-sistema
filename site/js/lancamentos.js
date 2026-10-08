// Tela Lançamentos (dono e gerente): erros do dia, notas e CMV da quinzena, nutricionista.
// Cada formulário carrega o que já existe para a data escolhida: lançar de novo corrige.
import { supabase } from './supabase.js';
import { el, avisar } from './util.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function hojeBrasil() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function dataBR(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

const doisDigitos = (n) => String(n).padStart(2, '0');

// Quinzenas: a atual e as 5 anteriores. Valor = data de início (dia 01 ou 16).
export function quinzenasRecentes(quantas = 6) {
  const [a, m, d] = hojeBrasil().split('-').map(Number);
  let ano = a, mes = m, segunda = d >= 16;
  const lista = [];
  for (let i = 0; i < quantas; i++) {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const inicio = `${ano}-${doisDigitos(mes)}-${segunda ? '16' : '01'}`;
    const rotulo = `${segunda ? '2ª' : '1ª'} quinzena de ${MESES[mes - 1]} (${segunda ? 16 : 1} a ${segunda ? ultimoDia : 15}/${doisDigitos(mes)})`;
    lista.push({ inicio, rotulo });
    if (segunda) segunda = false;
    else { segunda = true; mes -= 1; if (mes === 0) { mes = 12; ano -= 1; } }
  }
  return lista;
}

function numero(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const n = Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function campo(rotulo, entrada) {
  return el('div', {}, el('label', { class: 'form-label' }, rotulo), entrada);
}

function entradaNumero(atributos) {
  return el('input', { class: 'form-input', type: 'number', inputmode: 'decimal', ...atributos });
}

// Monta um formulário genérico ligado a uma tabela.
// "extras" devolve colunas que não são números digitados (ex.: a data da visita).
function formulario({ titulo, descricao, unidade, tabela, conflito, chaveDe, extras, seletor, campos, validar, recentes }) {
  const situacao = el('p', { class: 'form-situacao' });
  const listaRecentes = el('div', { class: 'recentes' });
  const botaoApagar = el('button', { class: 'btn-sec btn-perigo', type: 'button', hidden: true }, 'Apagar este lançamento');
  // Todo lançamento pertence a uma unidade: ela faz parte da identificação.
  const chaveUnidade = () => { const c = chaveDe(); return c ? { unidade, ...c } : null; };

  async function carregar() {
    const chave = chaveUnidade();
    for (const c of campos) c.entrada.value = '';
    botaoApagar.hidden = true;
    situacao.textContent = '';
    if (!chave) return;
    let consulta = supabase.from(tabela).select('*');
    for (const [k, v] of Object.entries(chave)) consulta = consulta.eq(k, v);
    const { data } = await consulta.maybeSingle();
    if (data) {
      for (const c of campos) c.entrada.value = data[c.coluna] ?? '';
      situacao.textContent = 'Já lançado. Salvar de novo substitui os valores.';
      botaoApagar.hidden = false;
    }
  }

  async function carregarRecentes() {
    const { data } = await supabase.from(tabela).select('*').eq('unidade', unidade)
      .order(recentes.ordem, { ascending: false }).limit(5);
    listaRecentes.replaceChildren(
      ...(data?.length
        ? [el('p', { class: 'recentes-titulo' }, 'Últimos lançamentos'),
          ...data.map((linha) => el('button', {
            type: 'button', class: 'recente',
            onclick: () => { recentes.selecionar(linha); carregar(); },
          }, el('span', {}, recentes.rotulo(linha)), el('span', { class: 'recente-valor' }, recentes.resumo(linha))))]
        : [el('p', { class: 'recentes-titulo' }, 'Nenhum lançamento ainda.')]),
    );
  }

  botaoApagar.addEventListener('click', async () => {
    if (!confirm('Apagar este lançamento? Não dá para desfazer.')) return;
    let consulta = supabase.from(tabela).delete();
    for (const [k, v] of Object.entries(chaveUnidade())) consulta = consulta.eq(k, v);
    const { error } = await consulta;
    if (error) return avisar('Não foi possível apagar: ' + error.message, 'erro');
    avisar('Lançamento apagado.');
    carregar(); carregarRecentes();
  });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const chave = chaveUnidade();
      if (!chave) return avisar('Escolha a data.', 'erro');
      const valores = {};
      for (const c of campos) {
        const n = numero(c.entrada.value);
        if (Number.isNaN(n)) return avisar(`Valor inválido em "${c.rotulo}".`, 'erro');
        valores[c.coluna] = n ?? c.vazio ?? null;
      }
      const problema = validar?.(valores, chave);
      if (problema) return avisar(problema, 'erro');
      const { error } = await supabase.from(tabela).upsert({ ...chave, ...extras?.(), ...valores }, { onConflict: conflito });
      if (error) return avisar('Não foi possível salvar: ' + error.message, 'erro');
      avisar('Lançado! Já aparece em Desempenho.');
      carregar(); carregarRecentes();
    },
  },
    seletor.map((s) => el('div', { class: 'form-row' }, s)),
    el('div', { class: 'form-grid' }, campos.map((c) => campo(c.rotulo, c.entrada))),
    situacao,
    el('button', { class: 'btn-primary', type: 'submit' }, 'Salvar'),
    botaoApagar,
  );

  const secao = el('section', { class: 'lanc-col' },
    el('p', { class: 'section-title' }, titulo),
    el('p', { class: 'section-desc' }, descricao),
    form,
    listaRecentes,
  );
  return { secao, carregar, carregarRecentes };
}

export function telaLancamentos(conteudo, ctx) {
  const unidade = ctx.unidade.codigo;
  const brl = (n) => 'R$ ' + Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const quinzenas = quinzenasRecentes();
  const rotuloQuinzena = (inicio) => quinzenas.find((q) => q.inicio === inicio)?.rotulo
    ?? `Quinzena iniciada em ${dataBR(inicio)}`;
  const seletorQuinzena = () => el('select', { class: 'form-input' },
    quinzenas.map((q) => el('option', { value: q.inicio }, q.rotulo)));

  // ----- Erros do dia -----
  const dataErros = el('input', { class: 'form-input', type: 'date', value: hojeBrasil(), max: hojeBrasil(), required: true });
  const erros = formulario({
    titulo: 'Erros do dia',
    descricao: 'Lance todo dia. Os erros somam no mês; o percentual usa o total de pedidos da Saipos e o custo é descontado do incentivo do setor.',
    unidade, tabela: 'erros_diarios', conflito: 'unidade,data',
    chaveDe: () => (dataErros.value ? { data: dataErros.value } : null),
    seletor: [campo('Dia', dataErros)],
    campos: [
      { coluna: 'erros_cozinha', rotulo: 'Erros — Cozinha', entrada: entradaNumero({ min: 0, step: 1, placeholder: '0' }), vazio: 0 },
      { coluna: 'erros_atendimento', rotulo: 'Erros — Atendimento', entrada: entradaNumero({ min: 0, step: 1, placeholder: '0' }), vazio: 0 },
      { coluna: 'custo_cozinha', rotulo: 'Custo — Cozinha (R$)', entrada: entradaNumero({ min: 0, step: 0.01, placeholder: '0,00' }), vazio: 0 },
      { coluna: 'custo_atendimento', rotulo: 'Custo — Atendimento (R$)', entrada: entradaNumero({ min: 0, step: 0.01, placeholder: '0,00' }), vazio: 0 },
    ],
    validar: (v) => (Number.isInteger(v.erros_cozinha) && Number.isInteger(v.erros_atendimento) ? null : 'A quantidade de erros precisa ser um número inteiro.'),
    recentes: {
      ordem: 'data',
      selecionar: (l) => { dataErros.value = l.data; },
      rotulo: (l) => dataBR(l.data),
      resumo: (l) => `${l.erros_cozinha + l.erros_atendimento} erro(s) · ${brl(Number(l.custo_cozinha) + Number(l.custo_atendimento))}`,
    },
  });
  dataErros.addEventListener('change', erros.carregar);

  // ----- Notas da quinzena -----
  const quinzenaNotas = seletorQuinzena();
  const notas = formulario({
    titulo: 'Notas das plataformas',
    descricao: 'Uma vez por quinzena. A média das duas quinzenas é a nota do mês.',
    unidade, tabela: 'notas_quinzena', conflito: 'unidade,inicio',
    chaveDe: () => ({ inicio: quinzenaNotas.value }),
    seletor: [campo('Quinzena', quinzenaNotas)],
    campos: [
      { coluna: 'nota_ifood', rotulo: 'Nota iFood', entrada: entradaNumero({ min: 0, max: 5, step: 0.01, placeholder: '0,00' }) },
      { coluna: 'nota_99food', rotulo: 'Nota 99food', entrada: entradaNumero({ min: 0, max: 5, step: 0.01, placeholder: '0,00' }) },
    ],
    validar: (v) => (v.nota_ifood === null && v.nota_99food === null ? 'Preencha pelo menos uma nota.' : null),
    recentes: {
      ordem: 'inicio',
      selecionar: (l) => { quinzenaNotas.value = l.inicio; },
      rotulo: (l) => rotuloQuinzena(l.inicio),
      resumo: (l) => `iFood ${l.nota_ifood ?? '—'} · 99food ${l.nota_99food ?? '—'}`,
    },
  });
  quinzenaNotas.addEventListener('change', notas.carregar);

  // ----- CMV da quinzena -----
  const quinzenaCmv = seletorQuinzena();
  const cmv = formulario({
    titulo: 'CMV da quinzena',
    descricao: 'Uma vez por quinzena. O CMV do mês é a média das duas quinzenas e só vale com o mês fechado.',
    unidade, tabela: 'cmv_quinzena', conflito: 'unidade,inicio',
    chaveDe: () => ({ inicio: quinzenaCmv.value }),
    seletor: [campo('Quinzena', quinzenaCmv)],
    campos: [
      { coluna: 'estoque_inicial', rotulo: 'Estoque inicial (R$)', entrada: entradaNumero({ min: 0, step: 0.01, placeholder: '0,00' }) },
      { coluna: 'estoque_final', rotulo: 'Estoque final (R$)', entrada: entradaNumero({ min: 0, step: 0.01, placeholder: '0,00' }) },
      { coluna: 'cmv_pct', rotulo: 'CMV (%)', entrada: entradaNumero({ min: 0, max: 100, step: 0.01, placeholder: '0,0' }) },
    ],
    validar: (v) => (v.cmv_pct === null ? 'Preencha o CMV (%).' : null),
    recentes: {
      ordem: 'inicio',
      selecionar: (l) => { quinzenaCmv.value = l.inicio; },
      rotulo: (l) => rotuloQuinzena(l.inicio),
      resumo: (l) => `${Number(l.cmv_pct).toLocaleString('pt-BR')}%`,
    },
  });
  quinzenaCmv.addEventListener('change', cmv.carregar);

  // ----- Nutricionista -----
  const dataVisita = el('input', { class: 'form-input', type: 'date', value: hojeBrasil(), max: hojeBrasil(), required: true });
  const numeroVisita = el('select', { class: 'form-input' },
    el('option', { value: '1' }, '1ª visita do mês'),
    el('option', { value: '2' }, '2ª visita do mês'));
  const nutri = formulario({
    titulo: 'Relatório da Nutricionista',
    descricao: 'Duas visitas por mês, cada uma com sua meta.',
    unidade, tabela: 'nutri_visitas', conflito: 'unidade,mes,visita',
    chaveDe: () => (dataVisita.value ? { mes: dataVisita.value.slice(0, 8) + '01', visita: Number(numeroVisita.value) } : null),
    extras: () => ({ data_visita: dataVisita.value }),
    seletor: [el('div', { class: 'form-row-pair' }, campo('Qual visita', numeroVisita), campo('Data da visita', dataVisita))],
    campos: [
      { coluna: 'nota_pct', rotulo: 'Nota (%)', entrada: entradaNumero({ min: 0, max: 100, step: 0.1, placeholder: '0,0' }) },
    ],
    validar: (v) => (v.nota_pct === null ? 'Preencha a nota.' : null),
    recentes: {
      ordem: 'data_visita',
      selecionar: (l) => { dataVisita.value = l.data_visita; numeroVisita.value = String(l.visita); },
      rotulo: (l) => `${l.visita}ª visita · ${dataBR(l.data_visita)}`,
      resumo: (l) => `${Number(l.nota_pct).toLocaleString('pt-BR')}%`,
    },
  });
  numeroVisita.addEventListener('change', nutri.carregar);
  dataVisita.addEventListener('change', nutri.carregar);

  conteudo.append(
    el('p', { class: 'aviso lanc-unidade' }, `Lançando na unidade ${ctx.unidade.nome}.`),
    el('div', { class: 'lanc-grid' }, erros.secao, notas.secao, cmv.secao, nutri.secao));
  for (const f of [erros, notas, cmv, nutri]) { f.carregar(); f.carregarRecentes(); }
}
