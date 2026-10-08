// Ícones dos títulos dos cartões (tirados da referência do DESIGN.md). Desenhos fixos, sem dado de usuário.
const ATRIBUTOS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const CHAMA = '<path d="M12 2.7c2.1 3.6-1.8 4.9-1.8 8.4a3.8 3.8 0 0 0 7.6 0c0-1.7-.8-2.7-1.5-3.5.4 1.9-.9 2.9-1.9 2.9-1.2 0-2-1-2-2.2C12.4 6.1 14 4.9 12 2.7z"/><path d="M9.3 12.5a4.9 4.9 0 0 0 9.4 2"/>';

const DESENHOS = {
  dinheiro: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M14.3 9.8c0-1-.9-1.6-2.3-1.6s-2.3.6-2.3 1.6c0 2.1 4.6 1.3 4.6 3.4 0 1-1 1.6-2.3 1.6s-2.3-.6-2.3-1.7"/>',
  etiqueta: '<path d="M12.6 3.6h5.8a2 2 0 0 1 2 2v5.8a2 2 0 0 1-.6 1.4l-8.4 8.4a2 2 0 0 1-2.8 0l-5.4-5.4a2 2 0 0 1 0-2.8l8.4-8.4a2 2 0 0 1 1.4-.6z"/><circle cx="16.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/>',
  porcento: '<line x1="18.5" y1="5.5" x2="5.5" y2="18.5"/><circle cx="7.3" cy="7.3" r="2"/><circle cx="16.7" cy="16.7" r="2"/>',
  chama: CHAMA,
  burger: '<path d="M4.5 9.8c0-3.3 3.4-5.7 7.5-5.7s7.5 2.4 7.5 5.7"/><line x1="4.2" y1="12.6" x2="19.8" y2="12.6"/><line x1="4.2" y1="15.6" x2="19.8" y2="15.6"/><path d="M3.5 18.4a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1 3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z"/>',
  alvo: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  calendario: '<rect x="4" y="5.5" width="16" height="14" rx="1.5"/><line x1="4" y1="9.5" x2="20" y2="9.5"/><line x1="8" y1="3.5" x2="8" y2="7"/><line x1="16" y1="3.5" x2="16" y2="7"/>',
  planilha: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="14.5" x2="20" y2="14.5"/><line x1="10" y1="9" x2="10" y2="20.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  externo: '<path d="M14 4.5h5.5V10"/><line x1="19.5" y1="4.5" x2="11" y2="13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  planilha: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="14.5" x2="20" y2="14.5"/><line x1="10" y1="9" x2="10" y2="20.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  externo: '<path d="M14 4.5h5.5V10"/><line x1="19.5" y1="4.5" x2="11" y2="13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
};

export function icone(nome) {
  const span = document.createElement('span');
  span.className = 'icone';
  span.innerHTML = `<svg ${ATRIBUTOS}>${DESENHOS[nome] ?? ''}</svg>`;
  return span;
}
