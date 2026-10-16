// PDFs guardados no sistema (bucket privado "documentos" do Supabase, uma pasta por unidade).
// Quem é da unidade abre por um link assinado que vale poucos minutos; só dono e gerente enviam (regras no banco).
import { supabase } from './supabase.js';

const BUCKET = 'documentos';
const LIMITE_MB = 20;

// Abre o PDF numa aba nova. A aba é aberta já no toque (senão o navegador do celular bloqueia)
// e recebe o endereço quando o link assinado fica pronto.
export async function abrirPdf(caminho) {
  const aba = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 300);
  if (error || !data?.signedUrl) {
    aba?.close();
    throw new Error(error?.message?.includes('not found') ? 'Arquivo ainda não enviado.' : (error?.message ?? 'Não foi possível abrir.'));
  }
  if (aba) aba.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

// Envia (ou substitui) o PDF no caminho indicado, ex.: "SM/escala-mensal.pdf".
export async function enviarPdf(caminho, arquivo) {
  if (!arquivo) throw new Error('Escolha um arquivo.');
  if (arquivo.type && arquivo.type !== 'application/pdf') throw new Error('O arquivo precisa ser PDF.');
  if (arquivo.size > LIMITE_MB * 1024 * 1024) throw new Error(`O PDF passa de ${LIMITE_MB} MB.`);
  const { error } = await supabase.storage.from(BUCKET)
    .upload(caminho, arquivo, { upsert: true, contentType: 'application/pdf', cacheControl: '60' });
  if (error) throw new Error(error.message);
}
