// Aba Etiquetas (só funcionários): imprime etiquetas de validade de insumos na Niimbot B1 (50×30 mm).
// Adaptado do pacote do dono (08/10/2026). Insumos e responsáveis não são cadastrados pelo site (só por SQL,
// a pedido do dono) e o histórico de impressões não pode ser apagado pelo site.
import { supabase } from './supabase.js';
import { el, limpar, avisar } from './util.js';
import { Impressora, canvasParaLinhas, suportaBluetooth, LARGURA_PX } from './niimbot.js';

const ALTURA_PX = 240; // 30 mm a 203 dpi
// Fonte só do desenho impresso na etiqueta (a tela do sistema usa Instrument Sans).
const FONTE = '"Source Serif 4", Georgia, serif';
const CATEGORIAS = ['Padaria', 'Proteínas', 'Hortifruti', 'Laticínios', 'Doces', 'Industrializados', 'Produção própria'];
const ROTULO_METODO = { congelado: 'Congelado', refrigerado: 'Refrigerado', ambiente: 'Temperatura ambiente' };
const MAX_COPIAS = 20;

// A conexão com a impressora vale para o aparelho todo: fica ao trocar de aba.
const impressora = new Impressora();

// ---------- Datas ----------

const dois = (n) => String(n).padStart(2, '0');
const textoManipulacao = (d) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
const textoValidade = (d) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${dois(d.getFullYear() % 100)}`;
const paraCampoData = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
const paraIsoData = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const somarDias = (d, dias) => { const r = new Date(d); r.setDate(r.getDate() + dias); return r; };

// ---------- Desenho da etiqueta ----------

let logo = null;
let preparado = null;

// Carrega a logo preta (a impressora não imprime cores) e as fontes uma única vez.
function prepararDesenho() {
  preparado ??= (async () => {
    logo = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'img/logo-etiqueta.png';
    });
    try {
      await Promise.all([
        document.fonts.load(`700 30px ${FONTE}`),
        document.fonts.load(`400 14px ${FONTE}`),
      ]);
    } catch { /* sem a fonte, usa a de reserva */ }
  })();
  return preparado;
}

function ajustarTamanho(c, texto, larguraMax, inicial, peso, minimo = 14) {
  let tamanho = inicial;
  c.font = `${peso} ${tamanho}px ${FONTE}`;
  while (tamanho > minimo && c.measureText(texto).width > larguraMax) {
    tamanho -= 1;
    c.font = `${peso} ${tamanho}px ${FONTE}`;
  }
  return tamanho;
}

function desenharEtiqueta(canvas, { insumo, manipulacao, validade, metodo, responsavel }) {
  canvas.width = LARGURA_PX;
  canvas.height = ALTURA_PX;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  const W = LARGURA_PX, H = ALTURA_PX, pad = 16;
  const logoAltura = 61;
  const logoLargura = logo ? Math.round(logoAltura * (logo.naturalWidth / logo.naturalHeight)) : 0;

  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#000';
  c.strokeStyle = '#000';
  c.textBaseline = 'alphabetic';

  const titulo = insumo || 'Selecione um insumo';
  ajustarTamanho(c, titulo, W - pad * 2, 30, 700, 16);
  c.fillText(titulo, pad, 36);
  c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(pad, 50); c.lineTo(W - pad, 50); c.stroke();

  c.font = `400 14px ${FONTE}`;
  c.fillText('Manipulação', pad, 74);
  c.font = `700 30px ${FONTE}`;
  c.fillText(manipulacao, pad, 116);
  if (metodo) {
    c.font = `400 12px ${FONTE}`;
    c.fillText(metodo, pad, 132);
  }

  const direita = W / 2 + 14;
  c.font = `400 14px ${FONTE}`;
  c.fillText('Validade', direita, 74);
  c.font = `700 34px ${FONTE}`;
  c.fillText(validade, direita, 120);
  const caixa = c.measureText(validade).width + 16;
  c.lineWidth = 2;
  c.strokeRect(direita - 8, 88, caixa, 42);

  c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(pad, 146); c.lineTo(W - pad, 146); c.stroke();

  c.font = `400 14px ${FONTE}`;
  c.fillText('Responsável', pad, 170);
  const nome = responsavel || '—';
  ajustarTamanho(c, nome, W - pad * 2 - logoLargura - 10, 26, 700, 14);
  c.fillText(nome, pad, 202);

  if (logo) c.drawImage(logo, W - pad - logoLargura, H - pad - logoAltura, logoLargura, logoAltura);
}

// ---------- Tela ----------

export function telaEtiquetas(conteudo, ctx) {
  const unidade = ctx.unidade.codigo;
  const estado = {
    aba: 'imprimir',
    insumos: [],
    historico: [],
    insumoId: null,
    metodo: null,
    copias: 1,
    manipulacao: new Date(),
    // Responsável é sempre quem está logado (pedido do dono); o banco grava o mesmo nome no histórico.
    responsavel: ctx.eu.nome,
    categoriasAbertas: new Set(),
  };

  const area = el('div', {});
  const botoesAba = [['imprimir', 'Imprimir'], ['impressoes', 'Impressões']].map(([id, rotulo]) => el('button', {
    type: 'button', 'data-sub': id,
    onclick: () => { estado.aba = id; desenhar(); },
  }, rotulo));
  conteudo.append(el('div', { class: 'etiquetas' }, el('nav', { class: 'et-subtabs', 'aria-label': 'Etiquetas' }, botoesAba), area));

  const insumoAtual = () => estado.insumos.find((i) => i.id === estado.insumoId) || null;

  async function carregarListas() {
    const { data, error } = await supabase.from('etiqueta_insumos').select('*').eq('unidade', unidade).order('nome');
    if (error) {
      avisar('Não foi possível carregar os insumos: ' + error.message, 'erro');
      return;
    }
    estado.insumos = data;
    if (!insumoAtual()) { estado.insumoId = null; estado.metodo = null; }
  }

  async function carregarHistorico() {
    const { data, error } = await supabase.from('etiqueta_historico').select('*')
      .eq('unidade', unidade).order('criado_em', { ascending: false }).limit(50);
    if (error) return avisar('Não foi possível carregar o histórico: ' + error.message, 'erro');
    estado.historico = data;
  }

  async function desenhar() {
    botoesAba.forEach((b) => b.classList.toggle('active', b.dataset.sub === estado.aba));
    limpar(area).append(el('p', { class: 'et-carregando' }, 'Carregando…'));
    await prepararDesenho();
    if (estado.aba === 'impressoes') await carregarHistorico();
    else await carregarListas();
    limpar(area);
    if (estado.aba === 'imprimir') montarImprimir(area);
    else montarImpressoes(area);
  }

  // ----- Imprimir -----
  function montarImprimir(alvo) {
    estado.manipulacao = new Date(); // a manipulação começa em "agora"; dá para mudar no campo
    const canvas = el('canvas', { class: 'et-previa', width: LARGURA_PX, height: ALTURA_PX, 'aria-label': 'Pré-visualização da etiqueta' });
    const listaInsumos = el('div', { class: 'et-categorias' });
    const listaMetodos = el('div', { class: 'et-chips' });
    const campoData = el('input', { type: 'datetime-local', class: 'form-input', value: paraCampoData(estado.manipulacao) });
    const numeroCopias = el('span', { class: 'et-copias-n', 'aria-live': 'polite' }, String(estado.copias));
    const situacao = el('p', { class: 'et-situacao', 'aria-live': 'polite' });
    const estadoImpressora = el('p', { class: 'et-impressora' });
    const botaoImprimir = el('button', { type: 'button', class: 'btn-primary' }, 'Imprimir etiqueta');
    const botaoConectar = el('button', { type: 'button', class: 'btn-sec' }, 'Conectar');

    const dadosDaEtiqueta = () => {
      const ins = insumoAtual();
      const met = ins?.metodos.find((m) => m.metodo === estado.metodo) ?? null;
      return {
        ins, met,
        manip: estado.manipulacao,
        validade: met ? somarDias(estado.manipulacao, met.dias) : estado.manipulacao,
      };
    };

    const previa = () => {
      const { ins, met, manip, validade } = dadosDaEtiqueta();
      desenharEtiqueta(canvas, {
        insumo: ins?.nome ?? '',
        manipulacao: textoManipulacao(manip),
        validade: textoValidade(validade),
        metodo: met ? ROTULO_METODO[met.metodo] : '',
        responsavel: estado.responsavel,
      });
    };

    const mostrarMetodos = () => {
      const ins = insumoAtual();
      listaMetodos.replaceChildren(...(ins
        ? ins.metodos.map((m) => el('button', {
          type: 'button', class: 'et-chip' + (m.metodo === estado.metodo ? ' ativo' : ''), 'aria-pressed': String(m.metodo === estado.metodo),
          onclick: () => { estado.metodo = m.metodo; mostrarMetodos(); previa(); },
        }, `${ROTULO_METODO[m.metodo]} · ${m.dias} ${m.dias === 1 ? 'dia' : 'dias'}`))
        : [el('p', { class: 'et-dica' }, 'Escolha um insumo.')]));
    };

    const mostrarInsumos = () => {
      const porCategoria = new Map(CATEGORIAS.map((c) => [c, []]));
      for (const i of estado.insumos) porCategoria.get(i.categoria)?.push(i);
      const selecionada = insumoAtual()?.categoria;
      listaInsumos.replaceChildren(...[...porCategoria].filter(([, itens]) => itens.length).map(([categoria, itens]) =>
        el('details', {
          class: 'et-categoria', open: estado.categoriasAbertas.has(categoria) || categoria === selecionada,
          ontoggle: (e) => { if (e.target.open) estado.categoriasAbertas.add(categoria); else estado.categoriasAbertas.delete(categoria); },
        },
        el('summary', {}, categoria, el('span', { class: 'et-contagem' }, String(itens.length))),
        el('div', { class: 'et-chips' }, itens.map((i) => el('button', {
          type: 'button', class: 'et-chip' + (i.id === estado.insumoId ? ' ativo' : ''), 'aria-pressed': String(i.id === estado.insumoId),
          onclick: () => {
            estado.insumoId = i.id;
            estado.metodo = i.metodos[0].metodo;
            mostrarInsumos(); mostrarMetodos(); previa();
          },
        }, i.nome))))));
      if (!estado.insumos.length) listaInsumos.append(el('p', { class: 'et-dica' }, 'Nenhum insumo cadastrado nesta unidade. Fale com o dono.'));
    };

    const mostrarImpressora = () => {
      estadoImpressora.textContent = impressora.conectada ? `Impressora: ${impressora.nome} conectada` : 'Impressora: não conectada';
      botaoConectar.textContent = impressora.conectada ? 'Reconectar' : 'Conectar';
    };
    impressora.aoDesconectar = mostrarImpressora;

    botaoConectar.addEventListener('click', async () => {
      if (impressora.conectada) impressora.desconectar();
      situacao.textContent = 'Conectando à impressora…';
      try {
        await impressora.conectar();
        situacao.textContent = '';
      } catch (e) {
        situacao.textContent = e.name === 'NotFoundError' ? 'Conexão cancelada.' : 'Não foi possível conectar: ' + e.message;
      }
      mostrarImpressora();
    });

    botaoImprimir.addEventListener('click', async () => {
      const { ins, met, manip, validade } = dadosDaEtiqueta();
      if (!ins || !met) return avisar('Escolha o insumo e a forma de armazenamento.', 'erro');
      if (Number.isNaN(manip.getTime())) return avisar('Informe a data de manipulação.', 'erro');
      botaoImprimir.disabled = true;
      try {
        if (!impressora.conectada) {
          situacao.textContent = 'Conectando à impressora…';
          await impressora.conectar();
          mostrarImpressora();
        }
        previa();
        await impressora.imprimir(canvasParaLinhas(canvas), estado.copias, (t) => { situacao.textContent = t; });
        situacao.textContent = `Etiqueta enviada (${estado.copias}x).`;
        const { error } = await supabase.from('etiqueta_historico').insert({
          unidade, insumo: ins.nome, metodo: met.metodo,
          manipulado_em: manip.toISOString(), validade: paraIsoData(validade),
          responsavel: estado.responsavel, copias: estado.copias,
        });
        if (error) avisar('Imprimiu, mas não foi possível registrar no histórico: ' + error.message, 'erro');
      } catch (e) {
        situacao.textContent = e.name === 'NotFoundError' ? 'Conexão cancelada.' : 'Não foi possível imprimir: ' + e.message;
        mostrarImpressora();
      } finally {
        botaoImprimir.disabled = false;
      }
    });

    campoData.addEventListener('input', () => {
      const d = new Date(campoData.value);
      if (!Number.isNaN(d.getTime())) { estado.manipulacao = d; previa(); }
    });

    const mudarCopias = (delta) => {
      estado.copias = Math.min(MAX_COPIAS, Math.max(1, estado.copias + delta));
      numeroCopias.textContent = String(estado.copias);
    };

    alvo.append(el('div', { class: 'et-grade' },
      el('section', {},
        el('p', { class: 'section-title' }, 'Imprimir etiqueta'),
        el('p', { class: 'section-desc' }, `Unidade ${ctx.unidade.nome} · etiqueta 50×30 mm`),
        !suportaBluetooth() && el('p', { class: 'aviso aviso-erro et-aviso' },
          'Este navegador não consegue falar com a impressora por Bluetooth. Para imprimir, abra o sistema no Chrome do Android ou do computador. (No iPhone não funciona.)'),
        el('div', { class: 'form-row' }, el('p', { class: 'form-label' }, 'Insumo'), listaInsumos),
        el('div', { class: 'form-row' }, el('p', { class: 'form-label' }, 'Forma de armazenamento'), listaMetodos),
        el('div', { class: 'form-row-pair form-row' },
          el('div', {}, el('label', { class: 'form-label' }, 'Manipulação'), campoData),
          el('div', {}, el('p', { class: 'form-label' }, 'Responsável'), el('p', { class: 'et-responsavel' }, estado.responsavel))),
        el('div', { class: 'form-row' },
          el('p', { class: 'form-label' }, 'Cópias'),
          el('div', { class: 'et-copias' },
            el('button', { type: 'button', class: 'btn-sec', onclick: () => mudarCopias(-1), 'aria-label': 'Menos uma cópia' }, '−'),
            numeroCopias,
            el('button', { type: 'button', class: 'btn-sec', onclick: () => mudarCopias(1), 'aria-label': 'Mais uma cópia' }, '+')))),
      el('section', { class: 'et-lado' },
        el('p', { class: 'section-title' }, 'Pré-visualização'),
        el('div', { class: 'et-previa-caixa' }, canvas),
        el('div', { class: 'et-impressora-linha' }, estadoImpressora, botaoConectar),
        botaoImprimir,
        situacao),
    ));
    mostrarInsumos(); mostrarMetodos(); mostrarImpressora(); previa();
  }

  // ----- Impressões (histórico; não pode ser apagado pelo site) -----
  function montarImpressoes(alvo) {
    alvo.append(el('section', {},
      el('p', { class: 'section-title' }, 'Impressões'),
      el('p', { class: 'section-desc' }, `Últimas 50 etiquetas impressas na unidade ${ctx.unidade.nome}.`),
      estado.historico.length
        ? estado.historico.map((h) => el('div', { class: 'pessoa-row' },
          el('div', { class: 'pessoa-info' },
            el('div', { class: 'pessoa-nome' }, `${h.insumo} `, el('span', { class: 'tag-inline' }, ROTULO_METODO[h.metodo])),
            el('div', { class: 'pessoa-meta' },
              `Manip. ${textoManipulacao(new Date(h.manipulado_em))} · Val. ${textoValidade(new Date(`${h.validade}T12:00:00`))} · ${h.responsavel} · ${h.copias}x`)),
          el('span', { class: 'et-quando' }, textoManipulacao(new Date(h.criado_em)))))
        : el('p', { class: 'et-dica' }, 'Nenhuma etiqueta impressa ainda.'),
    ));
  }

  desenhar();
}
