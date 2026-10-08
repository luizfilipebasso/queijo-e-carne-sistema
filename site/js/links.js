// Aba Links importantes (só funcionários): atalhos para arquivos do Google Drive da unidade.
// Os endereços ficam no banco (tabela links_importantes), cadastrados por SQL a pedido do dono.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { icone } from './icones.js';
import { cabecalho } from './painel.js';

export async function telaLinks(conteudo, ctx) {
  const { data, error } = await supabase.from('links_importantes').select('*')
    .eq('unidade', ctx.unidade.codigo).order('ordem');
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar os links: ' + error.message)));
    return;
  }

  const linha = (l) => {
    const corpo = [
      el('span', { class: 'link-icone' }, icone(l.icone)),
      el('span', { class: 'link-texto' },
        el('span', { class: 'link-titulo' }, l.titulo),
        el('span', { class: 'link-sub' }, l.url ? 'Abrir no Google Drive' : 'Em breve')),
    ];
    return l.url
      ? el('a', { class: 'link-item', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, ...corpo, icone('externo'))
      : el('div', { class: 'link-item link-item-vazio', 'aria-disabled': 'true' }, ...corpo);
  };

  conteudo.append(el('section', { class: 'sec-links' },
    cabecalho(`Links importantes · ${ctx.unidade.nome}`, null, 'link'),
    el('p', { class: 'section-desc' }, 'Arquivos do Google Drive. Abrem com o mesmo e-mail Google que você usa para entrar aqui.'),
    data.length
      ? el('div', { class: 'link-lista' }, data.map(linha))
      : el('p', { class: 'et-dica' }, 'Nenhum link cadastrado para esta unidade.'),
  ));
}
