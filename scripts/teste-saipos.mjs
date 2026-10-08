// Chamada de teste à API de Dados da Saipos: node scripts/teste-saipos.mjs UNIDADE INICIO [FIM]
// (UNIDADE = SM ou SP; datas AAAA-MM-DD). Lê o token SAIPOS_TOKEN_<UNIDADE> de segredos/saipos.env
// (fora do GitHub) e nunca o imprime. As respostas vão para segredos/amostra-api/ (também fora do GitHub).
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const BASE = 'https://data.saipos.io/v1';
const unidade = (process.argv[2] || '').toUpperCase();
if (!/^[A-Z]{2,4}$/.test(unidade)) {
  console.error('Uso: node scripts/teste-saipos.mjs SM 2026-09-01 [2026-09-18]');
  process.exit(1);
}
const inicio = process.argv[3] || '2026-09-01';
const fim = process.argv[4] || inicio;
const periodo = `${unidade}-${inicio === fim ? inicio : `${inicio}_a_${fim}`}`;

// A API aceita no máximo 15 dias por consulta: divide o período em blocos.
function blocosDe15Dias() {
  const blocos = [];
  for (let d = new Date(inicio + 'T00:00:00Z'); d <= new Date(fim + 'T00:00:00Z');) {
    const ate = new Date(Math.min(d.getTime() + 14 * 86400000, new Date(fim + 'T00:00:00Z').getTime()));
    blocos.push([d.toISOString().slice(0, 10), ate.toISOString().slice(0, 10)]);
    d = new Date(ate.getTime() + 86400000);
  }
  return blocos;
}

async function comRetentativa(fn) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn();
    } catch (e) {
      if (tentativa >= 4 || !/HTTP (429|5\d\d)/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, tentativa * 10000));
    }
  }
}

async function lerToken() {
  const texto = await readFile(RAIZ + 'segredos/saipos.env', 'utf8');
  const chave = `SAIPOS_TOKEN_${unidade}=`;
  const linha = texto.split(/\r?\n/).find((l) => l.startsWith(chave));
  const token = linha?.slice(chave.length).trim().replace(/^Bearer\s+/i, '');
  if (!token || token.startsWith('COLE_O_TOKEN')) throw new Error(`Token ${chave.slice(0, -1)} não encontrado em segredos/saipos.env`);
  return token;
}

async function buscarTudo(endpoint, token) {
  const registros = [];
  for (const [de, ate] of blocosDe15Dias()) {
    for (let offset = 0; ; offset += 1000) {
      const params = new URLSearchParams({
        p_date_column_filter: 'shift_date',
        p_filter_date_start: `${de}T00:00:00`,
        p_filter_date_end: `${ate}T23:59:59`,
        p_limit: '1000',
        p_offset: String(offset),
      });
      const pagina = await comRetentativa(async () => {
        const resp = await fetch(`${BASE}/${endpoint}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        const corpo = await resp.text();
        if (!resp.ok) throw new Error(`${endpoint}: HTTP ${resp.status} — ${corpo.slice(0, 300)}`);
        return JSON.parse(corpo);
      });
      registros.push(...pagina);
      if (pagina.length < 1000) break;
    }
  }
  return registros;
}

// Esconde dados pessoais de clientes antes de mostrar na tela.
function semDadosPessoais(valor) {
  return JSON.parse(JSON.stringify(valor, (chave, v) =>
    ['name', 'email', 'phone', 'document', 'birth_date', 'full_name', 'address', 'street', 'notes'].includes(chave) && v ? '***' : v));
}

const token = await lerToken();
await mkdir(RAIZ + 'segredos/amostra-api', { recursive: true });

for (const endpoint of ['search_sales', 'sales_items', 'sales_status_histories']) {
  try {
    const registros = await buscarTudo(endpoint, token);
    await writeFile(`${RAIZ}segredos/amostra-api/${endpoint}-${periodo}.json`, JSON.stringify(registros, null, 2));
    console.log(`\n===== ${endpoint}: ${registros.length} registro(s) em ${periodo} =====`);
    if (registros.length && inicio === fim) console.log(JSON.stringify(semDadosPessoais(registros[0]), null, 2).slice(0, 6000));
  } catch (e) {
    console.log(`\n===== ${endpoint}: ERRO =====\n${e.message}`);
  }
}
