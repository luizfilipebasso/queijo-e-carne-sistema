// Tela Pessoas (só o dono): autorizar e-mails, confirmar setor, desativar.
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

function mensagemDeErro(error) {
  if (error.code === '23505') return 'Este e-mail já está cadastrado.';
  return error.message;
}

export async function telaPessoas(conteudo, eu) {
  const recarregar = () => telaPessoas(limpar(conteudo), eu);

  const { data: pessoas, error } = await supabase.from('pessoas').select('*').order('nome');
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar: ' + error.message)));
    return;
  }

  async function salvar(id, campos, sucesso) {
    const { error: erro } = await supabase.from('pessoas').update(campos).eq('id', id);
    if (erro) return avisar(mensagemDeErro(erro), 'erro');
    avisar(sucesso);
    recarregar();
  }

  // ----- Autorizar novo acesso -----
  const email = el('input', { class: 'form-input', type: 'email', placeholder: 'nome@gmail.com', required: true, autocomplete: 'off' });
  const nome = el('input', { class: 'form-input', type: 'text', placeholder: 'Nome', required: true });
  const papel = seletorPapel('funcionario');
  const setor = seletorSetor('');
  const linhaSetor = el('div', {}, el('label', { class: 'form-label' }, 'Setor'), setor);
  papel.addEventListener('change', () => { linhaSetor.hidden = papel.value !== 'funcionario'; });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const { error: erro } = await supabase.from('pessoas').insert({
        email: email.value.trim().toLowerCase(),
        nome: nome.value.trim(),
        papel: papel.value,
        setor: papel.value === 'funcionario' && setor.value ? setor.value : null,
      });
      if (erro) return avisar(mensagemDeErro(erro), 'erro');
      avisar('Acesso autorizado. A pessoa já pode entrar com esse Google.');
      recarregar();
    },
  },
    el('div', { class: 'form-row' }, el('label', { class: 'form-label' }, 'E-mail Google'), email),
    el('div', { class: 'form-row' }, el('label', { class: 'form-label' }, 'Nome'), nome),
    el('div', { class: 'form-row form-row-pair' },
      el('div', {}, el('label', { class: 'form-label' }, 'Papel'), papel),
      linhaSetor),
    el('button', { class: 'btn-primary', type: 'submit' }, 'Autorizar acesso'),
  );

  // ----- Listas -----
  const ativos = pessoas.filter((p) => p.ativo);
  const aConfirmar = ativos.filter((p) => p.papel === 'funcionario' && !p.setor);
  const desativados = pessoas.filter((p) => !p.ativo);

  const linhaConfirmar = (p) => el('div', { class: 'pessoa-row destaque' },
    el('div', { class: 'pessoa-info' },
      el('div', { class: 'pessoa-nome' }, p.nome),
      el('div', { class: 'pessoa-meta' },
        p.setor_indicado ? `Indicou: ${ROTULO_SETOR[p.setor_indicado]}` : 'Ainda não indicou o setor'),
    ),
    el('div', { class: 'pessoa-acoes' },
      Object.entries(ROTULO_SETOR).map(([v, r]) => el('button', {
        class: v === p.setor_indicado ? 'btn-sec btn-forte' : 'btn-sec',
        onclick: () => salvar(p.id, { setor: v }, `Setor confirmado: ${r}.`),
      }, r)),
    ),
  );

  const linhaPessoa = (p) => {
    const ehEu = p.id === eu.id;
    const descricao = p.papel === 'funcionario'
      ? `Funcionário · ${p.setor ? ROTULO_SETOR[p.setor] : 'setor a confirmar'}`
      : ROTULO_PAPEL[p.papel];
    const linha = el('div', { class: 'pessoa-row' },
      el('div', { class: 'pessoa-info' },
        el('div', { class: 'pessoa-nome' }, p.nome, ehEu && el('span', { class: 'tag-inline' }, 'você')),
        el('div', { class: 'pessoa-meta' }, `${p.email} · ${descricao}`),
        el('div', { class: 'pessoa-meta' },
          p.ativo
            ? (p.user_id ? 'Já entrou no sistema' : 'Ainda não entrou') + ` · desde ${formatarData(p.data_inicio)}`
            : `Desativado em ${formatarData(p.data_fim)}`),
      ),
      !ehEu && el('div', { class: 'pessoa-acoes' },
        p.ativo && el('button', { class: 'btn-sec', onclick: () => abrirEdicao(linha, p) }, 'Editar'),
        p.ativo
          ? el('button', {
            class: 'btn-sec btn-perigo',
            onclick: () => confirm(`Desativar o acesso de ${p.nome}? O histórico continua guardado.`)
              && salvar(p.id, { ativo: false }, 'Acesso desativado.'),
          }, 'Desativar')
          : el('button', { class: 'btn-sec', onclick: () => salvar(p.id, { ativo: true }, 'Acesso reativado.') }, 'Reativar'),
      ),
    );
    return linha;
  };

  function abrirEdicao(linha, p) {
    const novoNome = el('input', { class: 'form-input', type: 'text', value: p.nome, required: true });
    const novoPapel = seletorPapel(p.papel);
    const novoSetor = seletorSetor(p.setor);
    const campoSetor = el('div', { hidden: p.papel !== 'funcionario' }, el('label', { class: 'form-label' }, 'Setor'), novoSetor);
    novoPapel.addEventListener('change', () => { campoSetor.hidden = novoPapel.value !== 'funcionario'; });
    linha.replaceWith(el('form', {
      class: 'pessoa-row pessoa-edicao',
      onsubmit: (e) => {
        e.preventDefault();
        salvar(p.id, {
          nome: novoNome.value.trim(),
          papel: novoPapel.value,
          setor: novoPapel.value === 'funcionario' && novoSetor.value ? novoSetor.value : null,
        }, 'Alterações salvas.');
      },
    },
      el('div', { class: 'form-row' }, el('label', { class: 'form-label' }, 'Nome'), novoNome),
      el('div', { class: 'form-row form-row-pair' },
        el('div', {}, el('label', { class: 'form-label' }, 'Papel'), novoPapel),
        campoSetor),
      el('div', { class: 'pessoa-acoes' },
        el('button', { class: 'btn-sec btn-forte', type: 'submit' }, 'Salvar'),
        el('button', { class: 'btn-sec', type: 'button', onclick: recarregar }, 'Cancelar'),
      ),
    ));
  }

  conteudo.append(
    el('div', { class: 'pessoas-grid' },
      el('section', {},
        el('p', { class: 'section-title' }, 'Autorizar novo acesso'),
        el('p', { class: 'section-desc' }, 'Cadastre o e-mail Google da pessoa. Ela entra pelo botão "Entrar com Google".'),
        form,
      ),
      el('div', {},
        aConfirmar.length > 0 && el('section', {},
          el('p', { class: 'section-title' }, `Confirmar setor (${aConfirmar.length})`),
          el('p', { class: 'section-desc' }, 'O setor define quais prêmios e descontos a pessoa recebe.'),
          aConfirmar.map(linhaConfirmar),
        ),
        el('section', {},
          el('p', { class: 'section-title' }, `Com acesso (${ativos.length})`),
          ativos.map(linhaPessoa),
        ),
        desativados.length > 0 && el('section', {},
          el('p', { class: 'section-title' }, `Desativados (${desativados.length})`),
          desativados.map(linhaPessoa),
        ),
      ),
    ),
  );
}

function formatarData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
