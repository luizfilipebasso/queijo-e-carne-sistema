// Meses que podem ser consultados: do primeiro mês com dados da Saipos até o mês atual.
// Setembro de 2026 foi carregado depois, para comparação (dono, 09/10/2026).
import { hojeBrasil } from './lancamentos.js';

export const INICIO_PROJETO = '2026-09-01';

export function mesAtual() {
  return hojeBrasil().slice(0, 8) + '01';
}

// Do mais recente para o mais antigo, no formato AAAA-MM-01.
export function mesesDisponiveis() {
  const lista = [];
  let [ano, mes] = mesAtual().split('-').map(Number);
  for (;;) {
    const iso = `${ano}-${String(mes).padStart(2, '0')}-01`;
    if (iso < INICIO_PROJETO) break;
    lista.push(iso);
    mes -= 1;
    if (mes === 0) { mes = 12; ano -= 1; }
  }
  return lista;
}

// "Outubro de 2026"
export function nomeMes(iso) {
  const [ano, mes] = iso.split('-').map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${ano}`;
}

// Etiqueta curta usada nos cartões: "mês vigente" ou "outubro de 2026".
export function rotuloMes(iso) {
  return iso === mesAtual() ? 'mês vigente' : nomeMes(iso).toLowerCase();
}
