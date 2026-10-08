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
    await this.caracteristica.startNotifications(); // a impressora só responde com isso ligado; não precisamos ler as respostas
  }

  desconectar() {
    if (this.dispositivo?.gatt?.connected) this.dispositivo.gatt.disconnect();
    this.caracteristica = null;
  }

  async enviar(comando, dados) {
    const bytes = pacote(comando, dados);
    const c = this.caracteristica;
    if (!c) throw new Error('Impressora desconectada.');
    if (c.properties.write) {
      await c.writeValueWithResponse(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 20) {
        await c.writeValueWithoutResponse(bytes.slice(i, i + 20));
        await pausa(10);
      }
    }
    await pausa(15);
  }

  // Imprime uma etiqueta já convertida em linhas (veja canvasParaLinhas), "copias" vezes.
  async imprimir(linhas, copias = 1, progresso = () => {}) {
    if (!this.conectada) throw new Error('Impressora desconectada.');
    for (let c = 1; c <= copias; c++) {
      progresso(`Imprimindo ${c} de ${copias}…`);
      await this.imprimirUma(linhas);
    }
  }

  async imprimirUma(linhas) {
    const total = linhas.length;
    await this.enviar(0xc1, [1]);
    await this.enviar(0x21, [3]);            // densidade
    await this.enviar(0x23, [1]);            // tipo de etiqueta: com espaço entre elas
    await this.enviar(0x01, [...u16(1), 0, 0, 0, 0, 0]); // começa a impressão
    await this.enviar(0x03, [1]);            // começa a página
    await this.enviar(0x13, [...u16(total), ...u16(LARGURA_PX), ...u16(1)]); // altura, largura, cópias da página

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
    for (let i = 0; i < 6; i++) {            // espera a impressora terminar de imprimir
      await pausa(500);
      await this.enviar(0xa3, [1]);
    }
    await this.enviar(0xf3, [1]);            // fim da impressão
  }
}
