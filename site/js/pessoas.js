// Tela Pessoas (só o dono): autorizar e-mails, definir em quais unidades cada pessoa trabalha
// (papel e setor em cada uma), confirmar setores e desativar acessos.
import { supabase } from './supabase.js';
import { el, limpar, ROTULO_PAPEL, ROTULO_SETOR, avisar } from './util.js';

function seletorSetor(valorAtual) {
  return el('select', { class: 'form-input' },
    el('option', { value: '' }, '— a confirmar —'),
    Object.entries(ROTULO_SETOR).map(([v, r]) => el('option', { value: v, selected: v === valorAtual }, r)),
  );
}

function seletorPapel(valorAtual) {
  return el('select', { class: 'form-input' },
    el('option', { value: 'funcionario', selected: valorAtual === 'funcionario' }, 'Funcionário'),
    el('option', { value: 'gerente', selected: valorAtual === 'gerente' }, 'Gerente'),
  );
}

// Papel + setor (o setor só aparece para funcionário).
function camposVinculo(papelAtual = 'funcionario', setorAtual = '') {
  const papel = seletorPapel(papelAtual);
  const setor = seletorSetor(setorAtual);
  const caixaSetor = el('div', { hidden: papel.value !== 'funcionario' }, el('label', { class: 'form-label' }, 'Setor'), setor);
  papel.addEventListener('change', () => { caixaSetor.hidden = papel.value !== 'funcionario'; });
  const valores = () => ({ papel: papel.value, setor: papel.value === 'funcionario' && setor.value ? setor.value : null });
  const bloco = el('div', { class: 'form-row-pair' }, el('div', {}, el('label', { class: 'form-label' }, 'Papel'), papel), caixaSetor);
  return { bloco, valores };
}

function mensagemDeErro(error) {
  if (error.code === '23505') return 'Este e-mail já está cadastrado.';
  return error.message;
}

function formatarData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export async function telaPessoas(conteudo, ctx) {
  const recarregar = () => telaPessoas(limpar(conteudo), ctx);
  const unidades = ctx.unidades;
  const nomeUnidade = (codigo) => unidades.find((u) => u.codigo === codigo)?.nome ?? codigo;

  const [{ data: pessoas, error }, { data: vinculos, error: erroV }] = await Promise.all([
    supabase.from('pessoas').select('*').order('nome'),
    supabase.from('pessoa_unidades').select('*'),
  ]);
  if (error || erroV) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar: ' + (error ?? erroV).message)));
    return;
  }
  const vinculosDe = (p) => vinculos.filter((v) => v.pessoa_id === p.id)
    .sort((a, b) => unidades.findIndex((u) => u.codigo === a.unidade) - unidades.findIndex((u) => u.codigo === b.unidade));

  async function executar(promessa, sucesso) {
    const { error: erro } = await promessa;
    if (erro) return avisar(mensagemDeErro(erro), 'erro');
    avisar(sucesso);
    recarregar();
  }
  const salvarPessoa = (id, campos, sucesso) => executar(supabase.from('pessoas').update(campos).eq('id', id), sucesso);
  const salvarVinculo = (v, campos, sucesso) => executar(
    supabase.from('pessoa_unidades').update(campos).eq('pessoa_id', v.pessoa_id).eq('unidade', v.unidade), sucesso);

  // ----- Autorizar novo acesso -----
  const email = el('input', { class: 'form-input', type: 'email', placeholder: 'nome@gmail.com', required: true, autocomplete: 'off' });
  const nome = el('input', { class: 'form-input', type: 'text', placeholder: 'Nome', required: true });
  const porUnidade = unidades.map((u) => {
    const marcado = el('input', { type: 'checkbox', checked: u.codigo === ctx.unidade.codigo });
    const campos = camposVinculo();
    campos.bloco.hidden = !marcado.checked;
    marcado.addEventListener('change', () => { campos.bloco.hidden = !marcado.checked; });
    return {
      unidade: u.codigo, marcado, campos,
      bloco: el('div', { class: 'novo-vinculo' }, el('label', { class: 'check' }, marcado, ` Trabalha em ${u.nome}`), campos.bloco),
    };
  });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const escolhidas = porUnidade.filter((x) => x.marcado.checked);
      if (!escolhidas.length) return avisar('Marque pelo menos uma unidade.', 'erro');
      const { data: nova, error: erro } = await supabase.from('pessoas')
        .insert({ email: email.value.trim().toLowerCase(), nome: nome.value.trim() }).select('id').single();
      if (erro) return avisar(mensagemDeErro(erro), 'erro');
      await executar(supabase.from('pessoa_unidades').insert(
        escolhidas.map((x) => ({ pessoa_id: nova.id, unidade: x.unidade, ...x.campos.valores() }))),
      'Acesso autorizado. A pessoa já pode entrar com esse Google.');
    },
  },
    el('div', { class: 'form-row' }, el('label', { class: 'form-label' }, 'E-mail Google'), email),
    el('div', { class: 'form-row' }, el('label', { class: 'form-label' }, 'Nome'), nome),
    porUnidade.map((x) => x.bloco),
    el('button', { class: 'btn-primary', type: 'submit' }, 'Autorizar acesso'),
  );

  // ----- Listas -----
  const ativos = pessoas.filter((p) => p.ativo);
  const desativados = pessoas.filter((p) => !p.ativo);
  const aConfirmar = vinculos.filter((v) => v.ativo && v.papel === 'funcionario' && !v.setor
    && ativos.some((p) => p.id === v.pessoa_id));

  const linhaConfirmar = (v) => {
    const p = pessoas.find((x) => x.id === v.pessoa_id);
    return el('div', { class: 'pessoa-row destaque' },
      el('div', { class: 'pessoa-info' },
        el('div', { class: 'pessoa-nome' }, p.nome),
        el('div', { class: 'pessoa-meta' }, `${nomeUnidade(v.unidade)} · `,
          v.setor_indicado ? `indicou ${ROTULO_SETOR[v.setor_indicado]}` : 'ainda não indicou o setor')),
      el('div', { class: 'pessoa-acoes' },
        Object.entries(ROTULO_SETOR).map(([s, r]) => el('button', {
          class: s === v.setor_indicado ? 'btn-sec btn-forte' : 'btn-sec',
          onclick: () => salvarVinculo(v, { setor: s }, `Setor confirmado: ${r} em ${nomeUnidade(v.unidade)}.`),
        }, r))));
  };

  function linhaVinculo(v) {
    const descricao = v.papel === 'funcionario'
      ? `Funcionário · ${v.setor ? ROTULO_SETOR[v.setor] : 'setor a confirmar'}`
      : ROTULO_PAPEL[v.papel];
    const linha = el('div', { class: 'vinculo-row' + (v.ativo ? '' : ' inativo') },
      el('span', {}, el('strong', {}, nomeUnidade(v.unidade)), ` · ${descricao} · `,
        v.ativo ? `desde ${formatarData(v.data_inicio)}` : `saiu em ${formatarData(v.data_fim)}`),
      el('span', { class: 'pessoa-acoes' },
        v.ativo && el('button', { class: 'btn-sec', onclick: () => editarVinculo(linha, v) }, 'Editar'),
        v.ativo
          ? el('button', {
            class: 'btn-sec btn-perigo',
            onclick: () => confirm(`Tirar o acesso a ${nomeUnidade(v.unidade)}? O histórico continua guardado.`)
              && salvarVinculo(v, { ativo: false }, 'Acesso à unidade desativado.'),
          }, 'Desativar')
          : el('button', { class: 'btn-sec', onclick: () => salvarVinculo(v, { ativo: true }, 'Acesso à unidade reativado.') }, 'Reativar')));
    return linha;
  }

  function editarVinculo(linha, v) {
    const campos = camposVinculo(v.papel, v.setor ?? '');
    linha.replaceWith(el('form', {
      class: 'vinculo-row vinculo-edicao',
      onsubmit: (e) => { e.preventDefault(); salvarVinculo(v, campos.valores(), 'Alterações salvas.'); },
    },
      el('strong', {}, nomeUnidade(v.unidade)),
      campos.bloco,
      el('span', { class: 'pessoa-acoes' },
        el('button', { class: 'btn-sec btn-forte', type: 'submit' }, 'Salvar'),
        el('button', { class: 'btn-sec', type: 'button', onclick: recarregar }, 'Cancelar'))));
  }

  function adicionarUnidade(botao, p, faltam) {
    const unidadeSel = el('select', { class: 'form-input' }, faltam.map((u) => el('option', { value: u.codigo }, u.nome)));
    const campos = camposVinculo();
    botao.replaceWith(el('form', {
      class: 'vinculo-row vinculo-edicao',
      onsubmit: (e) => {
        e.preventDefault();
        executar(supabase.from('pessoa_unidades').insert({ pessoa_id: p.id, unidade: unidadeSel.value, ...campos.valores() }),
          'Unidade adicionada.');
      },
    },
      el('div', {}, el('label', { class: 'form-label' }, 'Unidade'), unidadeSel),
      campos.bloco,
      el('span', { class: 'pessoa-acoes' },
        el('button', { class: 'btn-sec btn-forte', type: 'submit' }, 'Adicionar'),
        el('button', { class: 'btn-sec', type: 'button', onclick: recarregar }, 'Cancelar'))));
  }

  function cartaoPessoa(p) {
    const ehEu = p.id === ctx.eu.id;
    const meus = vinculosDe(p);
    const faltam = unidades.filter((u) => !meus.some((v) => v.unidade === u.codigo));
    const novoNome = () => {
      const n = prompt('Nome:', p.nome);
      if (n && n.trim() && n.trim() !== p.nome) salvarPessoa(p.id, { nome: n.trim() }, 'Nome atualizado.');
    };
    const botaoAdicionar = p.ativo && !p.eh_dono && faltam.length
      ? el('button', { class: 'btn-sec', onclick: (e) => adicionarUnidade(e.currentTarget, p, faltam) }, '+ Adicionar unidade')
      : null;
    return el('div', { class: 'pessoa-card' },
      el('div', { class: 'pessoa-row' },
        el('div', { class: 'pessoa-info' },
          el('div', { class: 'pessoa-nome' }, p.nome,
            p.eh_dono && el('span', { class: 'tag-inline' }, 'Dono · todas as unidades'),
            ehEu && el('span', { class: 'tag-inline' }, 'você')),
          el('div', { class: 'pessoa-meta' }, p.email, ' · ',
            p.ativo ? (p.user_id ? 'já entrou no sistema' : 'ainda não entrou') : 'acesso desativado')),
        !ehEu && el('div', { class: 'pessoa-acoes' },
          p.ativo && el('button', { class: 'btn-sec', onclick: novoNome }, 'Renomear'),
          p.ativo
            ? el('button', {
              class: 'btn-sec btn-perigo',
              onclick: () => confirm(`Desativar o login de ${p.nome} em todas as unidades? O histórico continua guardado.`)
                && salvarPessoa(p.id, { ativo: false }, 'Login desativado.'),
            }, 'Desativar login')
            : el('button', { class: 'btn-sec', onclick: () => salvarPessoa(p.id, { ativo: true }, 'Login reativado.') }, 'Reativar login'))),
      !p.eh_dono && el('div', { class: 'vinculos' },
        meus.length ? meus.map(linhaVinculo) : el('p', { class: 'pessoa-meta' }, 'Sem unidade: a pessoa entra, mas não vê nada.'),
        botaoAdicionar),
    );
  }

  conteudo.append(
    el('div', { class: 'pessoas-grid' },
      el('section', {},
        el('p', { class: 'section-title' }, 'Autorizar novo acesso'),
        el('p', { class: 'section-desc' }, 'Cadastre o e-mail Google da pessoa e em quais unidades ela trabalha.'),
        form,
      ),
      el('div', {},
        aConfirmar.length > 0 && el('section', {},
          el('p', { class: 'section-title' }, `Confirmar setor (${aConfirmar.length})`),
          el('p', { class: 'section-desc' }, 'O setor define quais prêmios e descontos a pessoa recebe naquela unidade.'),
          aConfirmar.map(linhaConfirmar),
        ),
        el('section', {},
          el('p', { class: 'section-title' }, `Com acesso (${ativos.length})`),
          ativos.map(cartaoPessoa),
        ),
        desativados.length > 0 && el('section', {},
          el('p', { class: 'section-title' }, `Desativados (${desativados.length})`),
          desativados.map(cartaoPessoa),
        ),
      ),
    ),
  );
}
