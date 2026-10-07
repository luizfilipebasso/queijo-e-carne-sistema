// Servidor simples para testar o site no próprio computador: node scripts/servidor-local.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = fileURLToPath(new URL('../site/', import.meta.url));
const PORTA = 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arquivo = normalize(join(PASTA, caminho.endsWith('/') ? caminho + 'index.html' : caminho));
  if (!arquivo.startsWith(PASTA)) { res.writeHead(403).end(); return; }
  try {
    const corpo = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream' }).end(corpo);
  } catch {
    res.writeHead(404).end('Não encontrado');
  }
}).listen(PORTA, () => console.log(`Site em http://localhost:${PORTA}`));
