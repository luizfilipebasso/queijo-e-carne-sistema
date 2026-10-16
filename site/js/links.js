// Aba Links importantes: atalhos da unidade (todos os cadastros).
// - Link do Google Drive (ex.: Planilha de consumos): campo "url", cadastrado por SQL a pedido do dono.
// - PDF guardado no sistema (Escala mensal, Guia de montagem): campo "arquivo"; dono e gerente enviam por aqui.
// - Relatórios da Nutricionista: os 2 PDFs do mês mais recente, enviados em Lançamentos (dono, 15/10/2026).
import { supabase } from './supabase.js';
import { el, avisar } from './util.js';
import { icone } from './icones.js';
import { cabecalho } from './painel.js';
import { abrirPdf, enviarPdf } from './documentos.js';
import { nomeMes } from './meses.js';

export async function telaLinks(conteudo, ctx) {
  const unidade = ctx.unidade.codigo;
  const [{ data, error }, { data: visitas }] = await Promise.all([
    supabase.from('links_importantes').select('*').eq('unidade', unidade).order('ordem'),
    supabase.from('nutri_visitas').select('mes, visita, data_visita, arquivo')
      .eq('unidade', unidade).not('arquivo', 'is', null).order('mes', { ascending: false }).limit(2),
  ]);
  if (error) {
    conteudo.append(el('section', {}, el('p', { class: 'aviso aviso-erro' }, 'Erro ao carregar os links: ' + error.message)));
    return;
  }
  const podeEnviar = ctx.papel === 'dono' || ctx.papel === 'gerente';

  const abrir = async (caminho) => {
    try { await abrirPdf(caminho); } catch (e) { avisar(e.message, 'erro'); }
  };

  // Linha clicável (ou "Em breve"), com botão de envio opcional ao lado.
  const linha = ({ titulo, nomeIcone, sub, acao, extra }) => {
    const corpo = [
      el('span', { class: 'link-icone' }, icone(nomeIcone)),
      el('span', { class: 'link-texto' }, el('span', { class: 'link-titulo' }, titulo), el('span', { class: 'link-sub' }, sub)),
    ];
    const item = acao
      ? (typeof acao === 'string'
        ? el('a', { class: 'link-item', href: acao, target: '_blank', rel: 'noopener noreferrer' }, ...corpo, icone('externo'))
        : el('button', { class: 'link-item', type: 'button', onclick: acao }, ...corpo, icone('externo')))
      : el('div', { class: 'link-item link-item-vazio', 'aria-disabled': 'true' }, ...corpo);
    return extra ? el('div', { class: 'link-com-envio' }, item, extra) : item;
  };

  const botaoEnviar = (l) => {
    const entrada = el('input', { type: 'file', accept: 'application/pdf', hidden: true });
    const botao = el('button', { class: 'btn-sec', type: 'button', onclick: () => entrada.click() }, l.arquivo_em ? 'Trocar PDF' : 'Enviar PDF');
    entrada.addEventListener('change', async () => {
      const arquivo = entrada.files?.[0];
      if (!arquivo) return;
      botao.disabled = true;
      botao.textContent = 'Enviando…';
      try {
        await enviarPdf(l.arquivo, arquivo);
        const { error: e } = await supabase.rpc('marcar_arquivo_enviado', { p_id: l.id });
        if (e) throw new Error(e.message);
        avisar(`${l.titulo}: PDF enviado.`);
        conteudo.replaceChildren();
        telaLinks(conteudo, ctx);
      } catch (e) {
        avisar('Não foi possível enviar: ' + e.message, 'erro');
        botao.disabled = false;
        botao.textContent = l.arquivo_em ? 'Trocar PDF' : 'Enviar PDF';
      }
    });
    return el('span', { class: 'link-envio' }, botao, entrada);
  };

  const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const itens = data.map((l) => {
    if (l.arquivo) {
      return linha({
        titulo: l.titulo, nomeIcone: l.icone,
        sub: l.arquivo_em ? `Abrir PDF · atualizado em ${dataCurta(l.arquivo_em)}` : 'Em breve',
        acao: l.arquivo_em ? () => abrir(l.arquivo) : null,
        extra: podeEnviar ? botaoEnviar(l) : null,
      });
    }
    return linha({ titulo: l.titulo, nomeIcone: l.icone, sub: l.url ? 'Abrir no Google Drive' : 'Em breve', acao: l.url || null });
  });

  // Relatórios da Nutricionista: sempre as 2 visitas do mês mais recente com relatório enviado.
  const mesNutri = visitas?.[0]?.mes ?? null;
  for (const n of [1, 2]) {
    const v = visitas?.find((x) => x.mes === mesNutri && x.visita === n);
    itens.push(linha({
      titulo: `Relatório da Nutricionista — ${n}ª visita`, nomeIcone: 'planilha',
      sub: v ? `Abrir PDF · ${nomeMes(v.mes).toLowerCase()}` : 'Em breve',
      acao: v ? () => abrir(v.arquivo) : null,
    }));
  }

  conteudo.append(el('section', { class: 'sec-links' },
    cabecalho(`Links importantes · ${ctx.unidade.nome}`, null, 'link'),
    el('p', { class: 'section-desc' }, podeEnviar
      ? 'Toque para abrir. Os PDFs ficam guardados no sistema; use "Enviar PDF" para trocar. Os relatórios da nutricionista são enviados em Lançamentos.'
      : 'Toque para abrir. Os PDFs abrem direto; a planilha abre no Google Drive com o mesmo e-mail que você usa aqui.'),
    el('div', { class: 'link-lista' }, itens),
  ));
}
