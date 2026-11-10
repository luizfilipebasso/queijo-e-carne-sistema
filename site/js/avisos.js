// Avisos para dono e gerente no topo do Painel e dos Lançamentos (dono, 10/11/2026):
// a Saipos parou de atualizar e lançamentos pendentes do mês atual e do anterior. Vêm de public.avisos.
import { supabase } from './supabase.js';
import { el } from './util.js';
import { dataBR } from './lancamentos.js';
import { nomeMes } from './meses.js';

const MAX_DIAS = 6;
const diaMes = (iso) => dataBR(iso).slice(0, 5);
const quinzena = (inicio) => `${inicio.endsWith('-01') ? '1ª' : '2ª'} quinzena de ${nomeMes(inicio.slice(0, 8) + '01').toLowerCase()}`;
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

// Devolve o bloco de avisos (ou null, se não há nada a avisar). Se a consulta falhar, não mostra nada:
// aviso é ajuda, não pode derrubar a tela.
export async function blocoAvisos(ctx) {
  const { data: a, error } = await supabase.rpc('avisos', { p_unidade: ctx.unidade.codigo });
  if (error || !a) return null;

  const pendencias = [];
  const dias = a.erros_sem_lancar ?? [];
  if (dias.length) {
    const lista = dias.slice(-MAX_DIAS).map(diaMes).join(', ');
    pendencias.push(`Erros do dia: ${dias.length === 1 ? 'falta 1 dia' : `faltam ${dias.length} dias`} `
      + `(${dias.length > MAX_DIAS ? 'os últimos: ' : ''}${lista}). Dia sem erro também se lança, com zero.`);
  }
  if (a.cmv_sem_lancar?.length) pendencias.push(`CMV: falta a ${a.cmv_sem_lancar.map(quinzena).join(' e a ')}.`);
  if (a.notas_sem_lancar?.length) pendencias.push(`Notas das plataformas: falta a ${a.notas_sem_lancar.map(quinzena).join(' e a ')}.`);
  if (a.nutri_faltando && a.nutri_faltando.visitas < 2) {
    pendencias.push(`Nutricionista: ${nomeMes(a.nutri_faltando.mes).toLowerCase()} tem ${a.nutri_faltando.visitas} de 2 visitas lançadas.`);
  }

  const saipos = a.saipos?.atrasada && el('p', { class: 'aviso aviso-erro' },
    el('strong', {}, 'A Saipos parou de atualizar. '),
    a.saipos.ultima_ok ? `A última busca que deu certo foi em ${quando(a.saipos.ultima_ok)}.` : 'Nenhuma busca deu certo ainda.',
    ' Os números abaixo podem estar atrasados; avise quem cuida do sistema.');

  if (!saipos && !pendencias.length) return null;
  return el('div', { class: 'avisos' },
    saipos,
    pendencias.length > 0 && el('div', { class: 'aviso' },
      el('strong', {}, `Lançamentos pendentes · ${ctx.unidade.nome}`),
      el('ul', { class: 'avisos-lista' }, pendencias.map((p) => el('li', {}, p)))));
}
