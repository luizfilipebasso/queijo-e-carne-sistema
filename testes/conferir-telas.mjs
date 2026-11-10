// Confere as telas antes de publicar (dono, 10/11/2026): abre o site com dados simulados (testes/simulacao.js)
// em cada tipo de acesso e falha se alguma aba der erro, ficar vazia ou passar da largura da tela.
// Roda no GitHub antes de cada publicação (.github/workflows/pages.yml). No computador:
//   npm install --no-save playwright && npx playwright install chromium && node testes/conferir-telas.mjs
// Motivo: em 08/10/2026 a aba Indicadores foi publicada em branco porque só a aba alterada tinha sido testada.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
// [descrição, parâmetros, abas esperadas (na ordem)]
const CASOS = [
  ['dono em SM', 'papel=dono&un=SM', ['painel', 'indicadores', 'comparar', 'lancamentos', 'etiquetas', 'links', 'pessoas']],
  ['dono em SP, mês encerrado', 'papel=dono&un=SP&enc=1', ['painel', 'indicadores', 'comparar', 'lancamentos', 'etiquetas', 'links', 'pessoas']],
  ['dono em SM, mês fechado', 'papel=dono&un=SM&fech=1', ['painel', 'indicadores', 'comparar', 'lancamentos', 'etiquetas', 'links', 'pessoas']],
  ['gerente em SM', 'papel=gerente&un=SM', ['painel', 'indicadores', 'lancamentos', 'etiquetas', 'links']],
  ['gerente em SP, sem avisos', 'papel=gerente&un=SP&semavisos=1', ['painel', 'indicadores', 'lancamentos', 'etiquetas', 'links']],
  ['Cozinha em SM, projeção de burgers', 'papel=funcionario&un=SM&setor=cozinha&bv=6000', ['indicadores', 'etiquetas', 'links']],
  ['Atendimento em SM', 'papel=funcionario&un=SM&setor=atendimento', ['indicadores', 'etiquetas', 'links']],
  ['Atendimento em SP, mês fechado', 'papel=funcionario&un=SP&setor=atendimento&fech=1', ['indicadores', 'etiquetas', 'links']],
  ['Produção em SM', 'papel=funcionario&un=SM&setor=producao', ['etiquetas', 'indicadores', 'links']],
];
const TELAS = [['computador', { width: 1280, height: 800 }], ['celular', { width: 400, height: 800 }]];
const MIN_LETRAS = 150;

const servidor = spawn(process.execPath, [fileURLToPath(new URL('../scripts/servidor-local.mjs', import.meta.url))], { stdio: 'ignore' });
const falhas = [];
let navegador;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  navegador = await chromium.launch();
  for (const [tela, viewport] of TELAS) {
    for (const [nome, parametros, abasEsperadas] of CASOS) {
      const pagina = await navegador.newPage({ viewport });
      const caso = `${nome} (${tela})`;
      try {
        await pagina.goto(`${BASE}/?${parametros}`);
        const r = JSON.parse(await pagina.evaluate(async () => (await import('/_testes/simulacao.js')).default));
        if (r.erros.length) falhas.push(`${caso}: erro de código: ${r.erros.join(' | ')}`);
        const abas = r.abas.map((a) => a.id);
        if (abas.join() !== abasEsperadas.join()) falhas.push(`${caso}: abas ${abas.join()} (esperado ${abasEsperadas.join()})`);
        for (const a of r.abas) {
          if (a.letras < MIN_LETRAS) falhas.push(`${caso}: aba ${a.nome} quase vazia (${a.letras} letras)`);
          if (a.largura > a.tela) falhas.push(`${caso}: aba ${a.nome} passa da largura da tela (${a.largura} > ${a.tela})`);
          if (a.erroNaTela) falhas.push(`${caso}: aba ${a.nome} mostra erro: ${a.erroNaTela}`);
        }
        console.log(`ok   ${caso}: ${r.abas.map((a) => `${a.nome} ${a.letras}`).join(', ')}`);
      } catch (e) {
        falhas.push(`${caso}: ${e.message}`);
      }
      await pagina.close();
    }
  }
} finally {
  await navegador?.close();
  servidor.kill();
}
if (falhas.length) {
  console.error(`\n${falhas.length} problema(s):\n- ${falhas.join('\n- ')}`);
  process.exit(1);
}
console.log('\nTodas as telas conferidas, sem erro.');
