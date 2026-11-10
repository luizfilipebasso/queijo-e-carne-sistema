// Simulação para conferir as telas sem login e sem banco (dados inventados; nada daqui é real).
// Usada por testes/conferir-telas.mjs (no GitHub, antes de cada publicação) e à mão em
// http://localhost:5173/?papel=dono&un=SM seguido de import('/_testes/simulacao.js') no console.
// Parâmetros do endereço: papel (dono|gerente|funcionario), un (SM|SP), setor, ate (data das vendas),
// bv (burgers vendidos), enc=1 (mês encerrado), fech=1 (mês fechado pelo dono), semavisos=1.
const q = new URLSearchParams(location.search);
const PAPEL = q.get('papel');
const UN = q.get('un') || 'SP';
const mm = (meta, sup, pm, ps, maior, pub) => ({ meta, super_meta: sup, premio_meta: pm, premio_super: ps, maior_melhor: maior, publico: pub });
const base = {
  cmv: mm(36, 35, 60, 120, false, 'todos'), ifood: mm(4.9, 4.95, 30, 60, true, 'todos'), nutri: mm(85, 95, 30, 60, true, 'cozinha,producao'),
  burgers: mm(7000, 8000, 60, 120, true, 'todos'), ticket_balcao: { meta: 70, super_meta: null }, ticket_delivery: { meta: 90, super_meta: null },
};
const M_SM = { ...base, cozinha: mm(450, 390, 60, 120, false, 'cozinha'), aguardando: mm(180, 165, 60, 120, false, 'atendimento'), erros_cozinha: mm(0.8, 0.5, 60, 120, false, 'cozinha'), erros_atendimento: mm(0.8, 0.5, 60, 120, false, 'atendimento') };
const M_SP = { ...base, cozinha: mm(450, 390, 60, 120, false, 'todos'), erros: mm(0.8, 0.5, 60, 120, false, 'todos'), keeta: mm(4.9, 4.95, 30, 60, true, 'todos'), f99: mm(4.9, 4.95, 30, 60, true, 'todos') };
const M = UN === 'SP' ? M_SP : M_SM;
const MES = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 8) + '01';
const ATE = q.get('ate') || MES.slice(0, 8) + '07';
const painel = { mes: MES, metas: M, unidade: UN, faturamento: 49534, pedidos: 734, burgers_vendidos: 1100, atualizado_ate: ATE, canais: [], ticket: { balcao: {}, delivery: {} }, ultimos_dias: [], produtos: [], burgers: [], combos: { total: 0, bebida: [], burger: [], adicional: [] } };
const ind = {
  cmv: [], mes: MES, metas: M, nutri: [], pedidos: 734, unidade: UN, notas: [],
  erros: { dias_lancados: 0, qtd_cozinha: 0, qtd_atendimento: 0, custo_cozinha: 0, custo_atendimento: 0, qtd_geral: 0, custo_geral: 0 },
  funcionarios: { cozinha: 7, atendimento: 3 }, cozinha: { pedidos: 734, segundos: 289, excluidos: 0 },
  cozinha_todos_os_tipos: UN === 'SP', aguardando: { pedidos: 385, segundos: 721, excluidos: 39, limite_seg: 1800 },
  mes_fechado: false, mes_encerrado: Boolean(q.get('enc') || q.get('fech')), atualizado_ate: ATE, burgers_vendidos: Number(q.get('bv') || 0), cozinha_limite_seg: 2400,
  ...(q.get('fech') ? { fechamento: { em: '2026-11-03T12:00:00Z', por: 'Dono Teste', premios: { cozinha: { bruto: 180, desconto: 12.5, liquido: 167.5 }, atendimento: { bruto: 60, desconto: 0, liquido: 60 }, producao: { bruto: 30, desconto: 0, liquido: 30 } } } } : {}),
};
const comp = { mes: MES, total: { pedidos: 1, faturamento: 1 }, unidades: [{ unidade: 'SM', nome: 'Santa Maria', metas: M_SM }, { unidade: 'SP', nome: 'São Paulo', metas: M_SP }] };
const avisos = q.get('semavisos') ? null : {
  saipos: { atrasada: true, ultima_ok: '2026-11-08T09:11:39Z', ultimo_erro: 'x' },
  erros_sem_lancar: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-11-08', '2026-11-09'],
  cmv_sem_lancar: ['2026-10-16'], notas_sem_lancar: ['2026-10-01', '2026-10-16'], nutri_faltando: { mes: '2026-10-01', visitas: 1 },
};
const U = [{ codigo: 'SM', nome: 'Santa Maria', sincronizar: true, ordem: 1 }, { codigo: 'SP', nome: 'São Paulo', sincronizar: true, ordem: 2 }];
const uAtual = U.find((u) => u.codigo === UN);
const R = {
  dono: { p: { id: 'p0', nome: 'Dono Teste', ativo: true, user_id: 'u1', eh_dono: true }, v: [], u: U },
  gerente: { p: { id: 'p1', nome: 'Gerente Teste', ativo: true, user_id: 'u1', eh_dono: false }, v: [{ pessoa_id: 'p1', unidade: UN, papel: 'gerente', setor: null, ativo: true }], u: [uAtual] },
  funcionario: { p: { id: 'p1', nome: 'Func Teste', ativo: true, user_id: 'u1', eh_dono: false }, v: [{ pessoa_id: 'p1', unidade: UN, papel: 'funcionario', setor: q.get('setor') || 'atendimento', ativo: true }], u: [uAtual] },
}[PAPEL];
const T = {
  pessoas: [R.p], unidades: R.u, pessoa_unidades: R.v, links_importantes: [],
  etiqueta_insumos: [{ id: 'a', nome: 'Descarte', categoria: 'Outros', metodos: [] }, { id: 'b', nome: 'Nutella', categoria: 'Doces', metodos: [{ metodo: 'ambiente', dias: 90 }] }],
  etiqueta_historico: [
    { insumo: 'Descarte', metodo: null, validade: null, manipulado_em: '2026-10-25T20:00:00Z', criado_em: '2026-10-25T20:00:00Z', responsavel: 'Fulano', copias: 1 },
    { insumo: 'Nutella', metodo: 'ambiente', validade: '2027-01-23', manipulado_em: '2026-10-25T20:00:00Z', criado_em: '2026-10-25T20:00:00Z', responsavel: 'Fulano', copias: 2 }],
  alteracoes: [
    { em: '2026-11-09T20:00:00Z', por_nome: 'Gerente Teste', tabela: 'erros_diarios', referencia: '2026-11-08', operacao: 'alterou', antes: { custo_cozinha: 10, erros_cozinha: 1 }, depois: { custo_cozinha: 25, erros_cozinha: 1 } },
    { em: '2026-11-03T12:00:00Z', por_nome: 'Dono Teste', tabela: 'fechamentos', referencia: '2026-10-01', operacao: 'fechou', antes: null, depois: {} },
    { em: '2026-11-02T12:00:00Z', por_nome: 'Gerente Teste', tabela: 'nutri_visitas', referencia: '2026-10-01 visita 2', operacao: 'incluiu', antes: null, depois: { nota_pct: 92, data_visita: '2026-10-28' } }],
  metas: Object.entries(M).map(([indicador, m]) => ({ unidade: UN, indicador, vale_a_partir_de: '2026-10-01', maior_melhor: true, publico: 'todos', premio_meta: null, premio_super: null, ...m })),
};
const erros = [];
addEventListener('error', (e) => erros.push(e.message));
addEventListener('unhandledrejection', (e) => erros.push(String(e.reason)));
try { localStorage.setItem('qc_unidade', UN); } catch { /* sem armazenamento */ }
const { supabase } = await import('/js/supabase.js');
supabase.auth.getSession = async () => ({ data: { session: { user: { id: 'u1' } } } });
supabase.rpc = async (n) => ({ data: { painel_mes: painel, indicadores_mes: ind, comparativo_mes: comp, avisos }[n] ?? null, error: null });
supabase.from = (t) => {
  const r = T[t] ?? [];
  const p = new Proxy({}, { get: (o, k) => (k === 'then' ? (res) => res({ data: r, error: null }) : k === 'maybeSingle' || k === 'single' ? async () => ({ data: t === 'pessoas' ? r[0] : null, error: null }) : () => p) });
  return p;
};
location.hash = '';
await import('/js/app.js?t=' + Date.now());
await new Promise((r) => setTimeout(r, 600));
const abas = [];
const registrar = (id, nome) => {
  const conteudo = document.querySelector('.conteudo');
  abas.push({
    id, nome, letras: conteudo.innerText.length,
    largura: document.documentElement.scrollWidth, tela: innerWidth,
    erroNaTela: [...conteudo.querySelectorAll('.aviso-erro')].filter((e) => !e.closest('.avisos') && !e.classList.contains('et-aviso')).map((e) => e.textContent).join(' | ') || null,
    avisos: conteudo.querySelector('.avisos')?.innerText ?? null,
    resumo: conteudo.querySelector('.ind-resumo')?.innerText ?? null,
    historico: conteudo.querySelector('.alt-lista')?.innerText ?? null,
    cartoes: [...conteudo.querySelectorAll('.ind-title')].map((e) => `${e.textContent} [${e.parentElement.querySelector('.ind-aud')?.textContent ?? ''}]`),
  });
};
for (const b of [...document.querySelectorAll('nav.tabs button')]) {
  location.hash = b.dataset.aba;
  await new Promise((r) => setTimeout(r, 700));
  registrar(b.dataset.aba, b.textContent);
  // Partes dentro da aba (Etiquetas: Imprimir, Impressões, Insumos): entram como "aba:parte".
  for (const sub of [...document.querySelectorAll('.conteudo .et-subtabs button')].slice(1)) {
    sub.click();
    await new Promise((r) => setTimeout(r, 500));
    registrar(`${b.dataset.aba}:${sub.dataset.sub}`, `${b.textContent} › ${sub.textContent}`);
  }
}
export default JSON.stringify({ papel: PAPEL, un: UN, abas, erros });
