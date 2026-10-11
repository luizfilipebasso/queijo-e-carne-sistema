// Impressora de etiquetas Niimbot B1 por Bluetooth (Web Bluetooth), sem biblioteca de terceiros.
// Funciona no Chrome/Edge do Android e do computador. Não funciona no iPhone (o Safari não tem Web Bluetooth).
//
// Protocolo: pacotes 0x55 0x55 | comando | tamanho | dados | verificação | 0xAA 0xAA,
// onde verificação = comando XOR tamanho XOR todos os bytes de dados.

const SERVICO = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
const CARACTERISTICA = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f';

export const LARGURA_PX = 384; // 48 mm da cabeça de impressão a 203 dpi
const BYTES_POR_LINHA = LARGURA_PX / 8;

export function suportaBluetooth() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];

function pacote(comando, dados) {
  let verificacao = comando ^ dados.length;
  for (const b of dados) verificacao ^= b;
  return Uint8Array.from([0x55, 0x55, comando, dados.length, ...dados, verificacao & 0xff, 0xaa, 0xaa]);
}

// Converte o desenho (canvas) em linhas de 1 bit: bit 1 = ponto preto, bit mais à esquerda primeiro.
export function canvasParaLinhas(canvas) {
  if (canvas.width !== LARGURA_PX) throw new Error(`A etiqueta precisa ter ${LARGURA_PX} px de largura.`);
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const linhas = [];
  for (let y = 0; y < height; y++) {
    const linha = new Uint8Array(BYTES_POR_LINHA);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luz = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
      if (pixels[i + 3] > 0 && luz < 128) linha[x >> 3] |= 0x80 >> (x & 7);
    }
    linhas.push(linha);
  }
  return linhas;
}

const vazia = (linha) => linha.every((b) => b === 0);
const iguais = (a, b) => a.every((v, i) => v === b[i]);

export class Impressora {
  constructor() {
    this.dispositivo = null;
    this.caracteristica = null;
    this.aoDesconectar = null;
    this.recebido = [];        // bytes que a impressora mandou (respostas), montados em pacotes
    this.ultimoStatus = null;  // última resposta ao pedido de status (0xA3 → 0xB3)
    this.semResposta = false;  // true se o aparelho não aceitar envio sem confirmação
  }

  get conectada() {
    return Boolean(this.dispositivo?.gatt?.connected && this.caracteristica);
  }

  get nome() {
    return this.dispositivo?.name || 'Niimbot';
  }

  // Precisa ser chamado a partir de um toque do usuário (regra do navegador).
  async conectar() {
    if (!suportaBluetooth()) throw new Error('Este navegador não tem Bluetooth. Use o Chrome no Android ou no computador.');
    if (this.conectada) return;
    if (!this.dispositivo) {
      this.dispositivo = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'B1' }],
        optionalServices: [SERVICO],
      });
      this.dispositivo.addEventListener('gattserverdisconnected', () => {
        this.caracteristica = null;
        this.aoDesconectar?.();
      });
    }
    const servidor = await this.dispositivo.gatt.connect();
    const servico = await servidor.getPrimaryService(SERVICO);
    this.caracteristica = await servico.getCharacteristic(CARACTERISTICA);
    // A impressora só responde com as notificações ligadas. Lemos só o status de impressão (para saber quando terminou).
    this.caracteristica.addEventListener('characteristicvaluechanged', (e) => this.receber(e.target.value));
    await this.caracteristica.startNotifications();
  }

  // Junta os pedaços que chegam e separa os pacotes 55 55 … AA AA.
  receber(dataView) {
    for (let i = 0; i < dataView.byteLength; i++) this.recebido.push(dataView.getUint8(i));
    for (;;) {
      const ini = this.recebido.findIndex((b, i) => b === 0x55 && this.recebido[i + 1] === 0x55);
      if (ini < 0) { this.recebido = []; return; }
      if (ini > 0) this.recebido.splice(0, ini);
      if (this.recebido.length < 4) return;
      const tam = this.recebido[3];
      const fim = 4 + tam + 3;
      if (this.recebido.length < fim) return;
      const comando = this.recebido[2];
      const dados = this.recebido.slice(4, 4 + tam);
      this.recebido.splice(0, fim);
      // Resposta de status: página (2 bytes), progresso da impressão e do avanço do papel (0 a 100).
      if (comando === 0xb3 && dados.length >= 4) {
        this.ultimoStatus = { pagina: (dados[0] << 8) | dados[1], impressao: dados[2], papel: dados[3] };
      }
    }
  }

  desconectar() {
    if (this.dispositivo?.gatt?.connected) this.dispositivo.gatt.disconnect();
    this.caracteristica = null;
  }

  // Envio rápido (como o app NiimBlue): o pacote inteiro sem esperar confirmação, com 10 ms entre pacotes.
  // Se o aparelho recusar, passa a mandar com confirmação (mais lento, mas funciona).
  async enviar(comando, dados) {
    const bytes = pacote(comando, dados);
    const c = this.caracteristica;
    if (!c) throw new Error('Impressora desconectada.');
    if (c.properties.writeWithoutResponse && !this.semResposta) {
      try {
        await c.writeValueWithoutResponse(bytes);
        await pausa(10);
        return;
      } catch {
        this.semResposta = true;
      }
    }
    if (c.properties.write) {
      await c.writeValueWithResponse(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 20) {
        await c.writeValueWithoutResponse(bytes.slice(i, i + 20));
        await pausa(10);
      }
      await pausa(15);
    }
  }

  // Espera a impressora terminar: pergunta o status até a página impressa chegar ao número de cópias.
  // Devolve como terminou: "ok", "parou" (a impressora parou antes de todas as cópias) ou "sem-status"
  // (não respondeu em 3 s; aí espera um tempo fixo por cópia, como a versão anterior).
  async esperarTerminar(copias, progresso) {
    this.ultimoStatus = null;
    const inicio = Date.now();
    let ultimaPagina = -1;
    let mudouEm = Date.now();
    while (Date.now() - inicio < 6000 + copias * 5000) {
      await this.enviar(0xa3, [1]);
      await pausa(250);
      const s = this.ultimoStatus;
      if (!s) {
        if (Date.now() - inicio >= 3000) return { como: 'sem-status', impressas: null };
        continue;
      }
      if (s.pagina !== ultimaPagina) {
        ultimaPagina = s.pagina;
        mudouEm = Date.now();
        if (copias > 1) progresso(`Imprimindo ${Math.min(s.pagina + 1, copias)} de ${copias}…`);
      }
      const paginaPronta = s.impressao >= 100 && s.papel >= 100;
      if (paginaPronta && s.pagina >= copias) return { como: 'ok', impressas: s.pagina };
      // Parada: a página atual terminou e nada mudou em 5 s (ex.: a impressora ignorou o pedido de cópias).
      if (paginaPronta && Date.now() - mudouEm > 5000) return { como: 'parou', impressas: s.pagina };
    }
    return { como: 'parou', impressas: Math.max(ultimaPagina, 0) };
  }

  // Imprime uma etiqueta já convertida em linhas (veja canvasParaLinhas), "copias" vezes.
  // Manda o desenho uma vez só e pede as cópias à impressora (como o app NiimBlue; dono, 11/10/2026).
  // Rede de segurança: se ela parar antes, imprime as que faltaram uma a uma.
  async imprimir(linhas, copias = 1, progresso = () => {}) {
    if (!this.conectada) throw new Error('Impressora desconectada.');
    progresso(copias > 1 ? `Imprimindo 1 de ${copias}…` : 'Imprimindo…');
    const r = await this.imprimirPagina(linhas, copias, progresso);
    if (r.como === 'parou' && r.impressas >= 1 && r.impressas < copias) {
      for (let c = r.impressas + 1; c <= copias; c++) {
        progresso(`Imprimindo ${c} de ${copias}…`);
        await this.imprimirPagina(linhas, 1, () => {});
      }
    }
  }

  async imprimirPagina(linhas, copias, progresso) {
    const total = linhas.length;
    await this.enviar(0xc1, [1]);
    await this.enviar(0x21, [3]);            // densidade
    await this.enviar(0x23, [1]);            // tipo de etiqueta: com espaço entre elas
    await this.enviar(0x01, [...u16(copias), 0, 0, 0, 0, 0]); // começa a impressão (total de páginas)
    await this.enviar(0x03, [1]);            // começa a página
    await this.enviar(0x13, [...u16(total), ...u16(LARGURA_PX), ...u16(copias)]); // altura, largura, cópias da página

    let y = 0;
    while (y < total) {
      let repete = 1;
      while (y + repete < total && repete < 255 && vazia(linhas[y]) === vazia(linhas[y + repete])
        && (vazia(linhas[y]) || iguais(linhas[y], linhas[y + repete]))) repete++;
      if (vazia(linhas[y])) await this.enviar(0x84, [...u16(y), repete]);
      else await this.enviar(0x85, [...u16(y), 0, 0, 0, repete, ...linhas[y]]);
      y += repete;
    }

    await this.enviar(0xe3, [1]);            // fim da página
    const r = await this.esperarTerminar(copias, progresso);
    if (r.como === 'sem-status' && copias > 1) await pausa((copias - 1) * 2500); // sem status: tempo fixo por cópia
    await this.enviar(0xf3, [1]);            // fim da impressão
    return r;
  }
}
