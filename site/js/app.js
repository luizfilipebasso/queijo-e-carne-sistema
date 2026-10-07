import { supabase } from './supabase.js';
import { el, limpar, ROTULO_PAPEL, ROTULO_SETOR, primeiroNome, avisar } from './util.js';
import { telaPessoas } from './pessoas.js';
import { telaLancamentos, hojeBrasil } from './lancamentos.js';
import { telaPainel } from './painel.js';
import { telaIndicadores } from './indicadores.js';

const raiz = document.getElementById('app');
const RODAPE = 'Queijo e Carne Burger LTDA — CNPJ 37.208.946/0001-58';

// Abas de cada papel: [id, rótulo, tela]
const ABAS = {
  dono: [['painel', 'Painel'], ['indicadores', 'Indicadores'], ['lancamentos', 'Lançamentos'], ['historico', 'Histórico'], ['pessoas', 'Pessoas']],
  gerente: [['painel', 'Painel'], ['indicadores', 'Indicadores'], ['lancamentos', 'Lançamentos'], ['historico', 'Histórico']],
  funcionario: [['incentivo', 'Meu incentivo'], ['indicadores', 'Indicadores']],
};

// Abas que ainda serão construídas, com a etapa do plano em que chegam.
const EM_CONSTRUCAO = {
  historico: ['Histórico', 'Resumo de cada mês e incentivo pago a cada funcionário. Chega na etapa 4.'],
  incentivo: ['Meu incentivo', 'Quanto você vai receber no mês e o detalhamento. Chega na etapa 5.'],
};

function mesVigente() {
  const [ano, mes] = hojeBrasil().split('-').map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${ano}`;
}

function logo(tamanho) {
  return el('img', { src: 'img/logo.png', alt: 'Queijo e Carne', width: tamanho, height: tamanho, class: 'logo' });
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

// ---------- Primeiro acesso do funcionário ----------

function telaEscolherSetor(eu) {
  const escolher = async (setor) => {
    const { error } = await supabase.rpc('indicar_meu_setor', { p_setor: setor });
    if (error) return avisar('Não foi possível salvar: ' + error.message, 'erro');
    iniciar();
  };
  limpar(raiz).append(
    el('main', { class: 'login' },
      logo(64),
      el('h1', { class: 'login-titulo' }, `Bem-vindo, ${primeiroNome(eu.nome)}!`),
      el('p', { class: 'login-sub' }, 'Em qual setor você trabalha?'),
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

function telaEmConstrucao(conteudo, id, eu) {
  const [titulo, texto] = EM_CONSTRUCAO[id];
  const secao = el('section', {},
    el('p', { class: 'section-title' }, titulo),
    el('p', { class: 'section-desc' }, texto),
  );
  if (id === 'incentivo' && !eu.setor) {
    secao.append(el('p', { class: 'aviso' },
      `Você indicou o setor ${ROTULO_SETOR[eu.setor_indicado] || '—'}. Aguardando o dono confirmar.`));
  }
  conteudo.append(secao);
}

function montarSistema(eu) {
  const abas = ABAS[eu.papel];
  const conteudo = el('div', { class: 'conteudo' });
  const botoes = abas.map(([id, rotulo]) =>
    el('button', { 'data-aba': id, onclick: () => { location.hash = id; } }, rotulo));

  const mostrar = () => {
    const pedida = location.hash.replace('#', '');
    const id = abas.some(([a]) => a === pedida) ? pedida : abas[0][0];
    botoes.forEach((b) => b.classList.toggle('active', b.dataset.aba === id));
    limpar(conteudo);
    if (id === 'pessoas') telaPessoas(conteudo, eu);
    else if (id === 'lancamentos') telaLancamentos(conteudo);
    else if (id === 'painel') telaPainel(conteudo);
    else if (id === 'indicadores') telaIndicadores(conteudo);
    else telaEmConstrucao(conteudo, id, eu);
  };
  window.onhashchange = mostrar;

  const papel = eu.papel === 'funcionario' && eu.setor ? ROTULO_SETOR[eu.setor] : ROTULO_PAPEL[eu.papel];
  limpar(raiz).append(
    el('header', { class: 'brandbar' },
      logo(38),
      el('div', { class: 'bn' }, 'Queijo e Carne', el('small', {}, `${primeiroNome(eu.nome)} · ${papel}`)),
      el('div', { class: 'month-badge' }, el('small', {}, 'Mês vigente'), el('strong', {}, mesVigente())),
      el('button', {
        class: 'btn-sec btn-sair',
        onclick: async () => { await supabase.auth.signOut(); location.hash = ''; iniciar(); },
      }, 'Sair'),
    ),
    el('nav', { class: 'tabs' }, botoes),
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
  if (eu.papel === 'funcionario' && !eu.setor && !eu.setor_indicado) return telaEscolherSetor(eu);
  montarSistema(eu);
}

iniciar();
