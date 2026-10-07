// Cria um elemento. Textos entram sempre como texto (nunca como HTML),
// para que um nome digitado não consiga injetar código na página.
export function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'class') no.className = valor;
    else if (chave.startsWith('on')) no.addEventListener(chave.slice(2), valor);
    else if (chave in no && chave !== 'list') no[chave] = valor;
    else no.setAttribute(chave, valor);
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    no.append(filho instanceof Node ? filho : String(filho));
  }
  return no;
}

export function limpar(no) {
  no.replaceChildren();
  return no;
}

export const ROTULO_PAPEL = { dono: 'Dono', gerente: 'Gerente', funcionario: 'Funcionário' };
export const ROTULO_SETOR = { cozinha: 'Cozinha', atendimento: 'Atendimento' };

export function primeiroNome(nome) {
  return (nome || '').trim().split(/\s+/)[0];
}

// Mostra um aviso temporário no rodapé da tela.
export function avisar(texto, tipo = 'ok') {
  const aviso = el('div', { class: `toast toast-${tipo}`, role: 'status' }, texto);
  document.body.append(aviso);
  setTimeout(() => aviso.remove(), 3500);
}
