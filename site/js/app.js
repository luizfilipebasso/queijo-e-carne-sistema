import { supabase } from './supabase.js';
import { el, limpar, ROTULO_PAPEL, ROTULO_SETOR, primeiroNome, avisar } from './util.js';
import { telaPessoas } from './pessoas.js';
import { telaLancamentos } from './lancamentos.js';
import { telaPainel } from './painel.js';
import { telaIndicadores } from './indicadores.js';
import { telaComparar } from './comparar.js';
import { telaEtiquetas } from './etiquetas.js';
import { mesAtual, mesesDisponiveis, nomeMes } from './meses.js';

const raiz = document.getElementById('app');
const RODAPE = 'Queijo e Carne Burger LTDA — CNPJ 37.208.946/0001-58';
const CHAVE_UNIDADE = 'qc_unidade';
const CHAVE_MES = 'qc_mes';

// Abas que ainda serão construídas, com a etapa do plano em que chegam.
const EM_CONSTRUCAO = {
  incentivo: ['Meu incentivo', 'Quanto você vai receber no mês e o detalhamento. Chega na etapa 5.'],
};

// Mês escolhido no topo: vale enquanto a aba do navegador estiver aberta; ao abrir de novo, volta ao mês atual.
function lerMesSalvo() {
  let salvo = null;
  try { salvo = sessionStorage.getItem(CHAVE_MES); } catch { /* sem armazenamento */ }
  return mesesDisponiveis().includes(salvo) ? salvo : mesAtual();
}
function salvarMes(iso) {
  try { sessionStorage.setItem(CHAVE_MES, iso); } catch { /* sem armazenamento: só não lembra */ }
}

function logo(tamanho) {
  return el('img', { src: 'img/logo.png', alt: 'Queijo e Carne', width: tamanho, height: tamanho, class: 'logo' });
}

function lerUnidadeSalva() {
  try { return localStorage.getItem(CHAVE_UNIDADE); } catch { return null; }
}
function salvarUnidade(codigo) {
  try { localStorage.setItem(CHAVE_UNIDADE, codigo); } catch { /* sem armazenamento: só não lembra */ }
}

async function sair() {
  await supabase.auth.signOut();
  location.hash = '';
  iniciar();
}

// ---------- Login ----------

// Quando o Google devolve um erro (ex.: e-mail não autorizado), ele vem no endereço.
function lerErroDoEndereco() {
  const busca = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const descricao = busca.get('error_description') || hash.get('error_description');
  if (!descricao) return null;
  history.replaceState(null, '', location.pathname);
  if (/database error|não autorizado/i.test(descricao)) {
    return 'Este e-mail Google não está autorizado. Peça ao dono para liberar o seu acesso.';
  }
  return 'Não foi possível entrar: ' + descricao;
}

function telaLogin(mensagem) {
  const botao = el('button', {
    class: 'btn-google',
    onclick: async () => {
      botao.disabled = true;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
      });
      if (error) {
        botao.disabled = false;
        avisar('Não foi possível abrir o login do Google: ' + error.message, 'erro');
      }
    },
  },
    el('img', { src: 'img/google.svg', alt: '', width: 18, height: 18 }),
    'Entrar com Google');

  limpar(raiz).append(
    el('main', { class: 'login' },
      logo(84),
      el('h1', { class: 'login-titulo' }, 'Queijo e Carne'),
      el('p', { class: 'login-sub' }, 'Indicadores e incentivos da equipe'),
      mensagem && el('p', { class: 'aviso aviso-erro' }, mensagem),
      botao,
      el('p', { class: 'login-nota' }, 'Só entra quem foi autorizado pelo dono.'),
    ),
    el('footer', {}, RODAPE, el('br'), el('a', { href: 'privacidade.html', class: 'link-discreto' }, 'Política de privacidade')),
  );
}

function telaAviso(titulo, texto) {
  limpar(raiz).append(
    el('main', { class: 'login' },
      logo(64),
      el('h1', { class: 'login-titulo' }, titulo),
      el('p', { class: 'login-sub' }, texto),
      el('button', { class: 'btn-sec', onclick: sair }, 'Sair'),
    ),
    el('footer', {}, RODAPE),
  );
}

// ---------- Primeiro acesso do funcionário numa unidade ----------

function telaEscolherSetor(ctx) {
  const escolher = async (setor) => {
    const { error } = await supabase.rpc('indicar_meu_setor', { p_unidade: ctx.unidade.codigo, p_setor: setor });
    if (error) return avisar('Não foi possível salvar: ' + error.message, 'erro');
    iniciar();
  };
  limpar(raiz).append(
    el('main', { class: 'login' },
      logo(64),
      el('h1', { class: 'login-titulo' }, `Bem-vindo, ${primeiroNome(ctx.eu.nome)}!`),
      el('p', { class: 'login-sub' }, `Em qual setor você trabalha na unidade ${ctx.unidade.nome}?`),
      el('div', { class: 'setor-opcoes' },
        el('button', { class: 'btn-primary', onclick: () => escolher('cozinha') }, 'Cozinha'),
        el('button', { class: 'btn-primary', onclick: () => escolher('atendimento') }, 'Atendimento'),
      ),
      el('p', { class: 'login-nota' }, 'O dono vai confirmar o seu setor.'),
    ),
    el('footer', {}, RODAPE),
  );
}

// ---------- Sistema ----------

function telaEmConstrucao(conteudo, id, ctx) {
  const [titulo, texto] = EM_CONSTRUCAO[id];
  const secao = el('section', {},
    el('p', { class: 'section-title' }, titulo),
    el('p', { class: 'section-desc' }, texto),
  );
  if (id === 'incentivo' && ctx.vinculo && !ctx.vinculo.setor) {
    secao.append(el('p', { class: 'aviso' },
      `Você indicou o setor ${ROTULO_SETOR[ctx.vinculo.setor_indicado] || '—'}. Aguardando o dono confirmar.`));
  }
  conteudo.append(secao);
}

// Abas conforme o papel na unidade selecionada.
function abasDe(ctx) {
  const comparar = ctx.unidadesEquipe.length > 1 ? [['comparar', 'Comparar']] : [];
  // Etiquetas: só para funcionários (decisão do dono, 08/10/2026).
  if (ctx.papel === 'funcionario') return [['incentivo', 'Meu incentivo'], ['indicadores', 'Indicadores'], ['etiquetas', 'Etiquetas']];
  const abas = [['painel', 'Painel'], ...comparar, ['indicadores', 'Indicadores'], ['lancamentos', 'Lançamentos']];
  if (ctx.papel === 'dono') abas.push(['pessoas', 'Pessoas']);
  return abas;
}

function montarSistema(ctx) {
  const abas = abasDe(ctx);
  const conteudo = el('div', { class: 'conteudo' });
  const botoes = abas.map(([id, rotulo]) =>
    el('button', { 'data-aba': id, onclick: () => { location.hash = id; } }, rotulo));

  const mostrar = () => {
    const pedida = location.hash.replace('#', '');
    const id = abas.some(([a]) => a === pedida) ? pedida : abas[0][0];
    botoes.forEach((b) => b.classList.toggle('active', b.dataset.aba === id));
    limpar(conteudo);
    if (id === 'pessoas') telaPessoas(conteudo, ctx);
    else if (id === 'lancamentos') telaLancamentos(conteudo, ctx);
    else if (id === 'painel') telaPainel(conteudo, ctx);
    else if (id === 'indicadores') telaIndicadores(conteudo, ctx);
    else if (id === 'comparar') telaComparar(conteudo, ctx);
    else if (id === 'etiquetas') telaEtiquetas(conteudo, ctx);
    else telaEmConstrucao(conteudo, id, ctx);
  };
  window.onhashchange = mostrar;

  const papel = ctx.papel === 'funcionario' && ctx.vinculo?.setor ? ROTULO_SETOR[ctx.vinculo.setor] : ROTULO_PAPEL[ctx.papel];
  const seletor = ctx.unidades.length > 1
    ? el('select', {
      class: 'unidade-select', 'aria-label': 'Unidade',
      onchange: (e) => { salvarUnidade(e.target.value); iniciar(); },
    }, ctx.unidades.map((u) => el('option', { value: u.codigo, selected: u.codigo === ctx.unidade.codigo }, u.nome)))
    : el('span', { class: 'unidade-fixa' }, ctx.unidade.nome);

  // Mês consultado: do início do projeto até o mês atual. Painel, Comparar e Indicadores seguem esta escolha.
  const seletorMes = el('select', {
    class: 'mes-select', 'aria-label': 'Mês',
    onchange: (e) => {
      ctx.mes = e.target.value;
      salvarMes(ctx.mes);
      mostrar();
    },
  }, mesesDisponiveis().map((m) => el('option', { value: m, selected: m === ctx.mes }, nomeMes(m))));

  limpar(raiz).append(
    el('header', { class: 'brandbar' },
      logo(36),
      el('div', { class: 'bn' }, 'Queijo e Carne', el('small', {}, `${primeiroNome(ctx.eu.nome)} · ${papel}`)),
      el('nav', { class: 'tabs', 'aria-label': 'Abas' }, botoes),
      el('div', { class: 'barra-direita' },
        seletor,
        el('div', { class: 'month-badge' }, seletorMes),
        el('button', { class: 'btn-sair', onclick: sair }, 'Sair')),
    ),
    conteudo,
    el('footer', {}, RODAPE),
  );
  mostrar();
}

async function iniciar() {
  const erro = lerErroDoEndereco();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return telaLogin(erro);

  const { data: eu, error } = await supabase
    .from('pessoas').select('*').eq('user_id', session.user.id).maybeSingle();
  if (error) return telaLogin('Erro ao carregar seu cadastro: ' + error.message);
  if (!eu || !eu.ativo) {
    await supabase.auth.signOut();
    return telaLogin('Seu acesso está desativado. Fale com o dono.');
  }

  // As regras do banco já devolvem só as unidades que a pessoa pode ver.
  const [{ data: unidadesVisiveis }, { data: vinculos }] = await Promise.all([
    supabase.from('unidades').select('*').order('ordem'),
    supabase.from('pessoa_unidades').select('*').eq('pessoa_id', eu.id).eq('ativo', true),
  ]);
  const unidades = (unidadesVisiveis ?? []).filter((u) => eu.eh_dono || vinculos?.some((v) => v.unidade === u.codigo));
  if (!unidades.length) return telaAviso('Quase lá!', 'Você ainda não tem unidade liberada. Fale com o dono.');

  const salva = lerUnidadeSalva();
  const unidade = unidades.find((u) => u.codigo === salva) ?? unidades[0];
  const vinculo = vinculos?.find((v) => v.unidade === unidade.codigo) ?? null;
  const ctx = {
    eu,
    unidades,
    unidade,
    vinculo,
    papel: eu.eh_dono ? 'dono' : vinculo.papel,
    mes: lerMesSalvo(),
    unidadesEquipe: unidades.filter((u) => eu.eh_dono || vinculos.some((v) => v.unidade === u.codigo && v.papel === 'gerente')),
  };

  if (ctx.papel === 'funcionario' && !vinculo.setor && !vinculo.setor_indicado) return telaEscolherSetor(ctx);
  montarSistema(ctx);
}

iniciar();
