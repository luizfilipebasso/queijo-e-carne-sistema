// Busca um dia comercial na API de Dados da Saipos e grava em saipos_vendas e saipos_itens.
// Chamada pela fila (private.processar_fila, veja supabase/migrations/20261007000003_fila_saipos.sql)
// com o corpo {"dia": "AAAA-MM-DD", "parte": "vendas" | "itens"}. Sem "parte", faz as duas.
// Segredos: SAIPOS_TOKEN (cadastrado no painel do Supabase); SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY vêm prontos.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BASE = 'https://data.saipos.io/v1';
const CANAIS: Record<string, string> = {
  'iFood': 'ifood',
  'Liga': 'alloy',
  'Delivery Much': 'delivery_much',
  'Delivery Much V2': 'delivery_much',
  'Goomer': 'goomer',
};
const TIPOS: Record<number, string> = { 1: 'delivery', 2: 'balcao' };

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Busca todas as páginas de um endpoint para um dia. A Saipos às vezes devolve 504/429: tenta de novo.
async function saipos(endpoint: string, dia: string, token: string): Promise<any[]> {
  const registros: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({
      p_date_column_filter: 'shift_date',
      p_filter_date_start: `${dia}T00:00:00`,
      p_filter_date_end: `${dia}T23:59:59`,
      p_limit: '1000',
      p_offset: String(offset),
    });
    let pagina: any[] | null = null;
    for (let tentativa = 1; pagina === null; tentativa++) {
      const resp = await fetch(`${BASE}/${endpoint}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        pagina = await resp.json();
      } else if (tentativa < 3 && (resp.status === 429 || resp.status >= 500)) {
        // Poucas tentativas aqui dentro (limite de 150 s); a fila repete a tarefa mais tarde.
        await resp.body?.cancel();
        await esperar(tentativa * 5000);
      } else {
        throw new Error(`${endpoint}: HTTP ${resp.status} — ${(await resp.text()).slice(0, 200)}`);
      }
    }
    registros.push(...pagina);
    if (pagina.length < 1000) return registros;
  }
}

function somaStatus(historico: any[], status: string): number | null {
  const doStatus = historico.filter((h) => h.desc_store_sale_status === status);
  return doStatus.length ? doStatus.reduce((s, h) => s + (h.duration_time_seconds ?? 0), 0) : null;
}

async function gravar(tabela: string, linhas: any[], chave: string) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from(tabela).upsert(linhas.slice(i, i + 500), { onConflict: chave });
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
}

async function sincronizarDia(dia: string, parte: string | null, token: string) {
  const { data: log } = await supabase.from('saipos_sincronizacoes').insert({ dia, parte }).select('id').single();
  const resultado: { dia: string; parte: string | null; vendas?: number; itens?: number; ok: boolean; erro?: string } = { dia, parte, ok: false };
  const erros: string[] = [];

  if (parte !== 'itens') try {
    const [vendas, historicos] = await Promise.all([
      saipos('search_sales', dia, token),
      saipos('sales_status_histories', dia, token),
    ]);
    const historicoPorVenda = new Map(historicos.map((h) => [h.id_sale, h.histories ?? []]));

    await gravar('saipos_vendas', vendas.map((v) => {
      const historico = historicoPorVenda.get(v.id_sale) ?? [];
      const parceiro = v.partner_sale?.desc_partner_sale ?? null;
      return {
        id_sale: v.id_sale,
        data: v.shift_date,
        criado_em: v.created_at,
        canal: parceiro ? (CANAIS[parceiro] ?? 'outro') : 'telefone',
        canal_original: parceiro,
        tipo: TIPOS[v.id_sale_type] ?? 'outro',
        cancelada: v.canceled === 'Y',
        fiado: (v.payments ?? []).some((p: any) => /^FIADO/i.test(p.desc_store_payment_type ?? '')),
        total: v.total_amount ?? 0,
        seg_cozinha: somaStatus(historico, 'Cozinha'),
        seg_aguardando_entrega: somaStatus(historico, 'Aguardando entrega'),
        atualizado_saipos: v.updated_at,
        sincronizado_em: new Date().toISOString(),
      };
    }), 'id_sale');
    resultado.vendas = vendas.length;
  } catch (e) {
    erros.push(`vendas: ${(e as Error).message}`);
  }

  // Itens em separado: se a Saipos falhar aqui, as vendas e os tempos do dia continuam salvos.
  if (parte !== 'vendas') try {
    const vendasComItens = await saipos('sales_items', dia, token);
    const linhas = vendasComItens.flatMap((v) => (v.items ?? []).map((i: any) => ({
      id_sale_item: i.id_sale_item,
      id_sale: v.id_sale,
      data: v.shift_date,
      descricao: (i.desc_sale_item ?? '').trim(),
      quantidade: i.quantity ?? 0,
      preco_unitario: i.unit_price ?? 0,
      apagado: i.deleted === 'Y',
      escolhas: (i.choices ?? [])
        .filter((c: any) => c.deleted !== 'Y')
        .map((c: any) => ({ descricao: (c.desc_sale_item_choice ?? '').trim(), preco: c.aditional_price ?? 0 })),
      sincronizado_em: new Date().toISOString(),
    })));
    await gravar('saipos_itens', linhas, 'id_sale_item');
    resultado.itens = linhas.length;
  } catch (e) {
    erros.push(`itens: ${(e as Error).message}`);
  }

  resultado.ok = erros.length === 0;
  if (erros.length) resultado.erro = erros.join(' | ');
  if (log) {
    await supabase.from('saipos_sincronizacoes').update({
      terminado_em: new Date().toISOString(),
      vendas: resultado.vendas ?? null,
      itens: resultado.itens ?? null,
      ok: resultado.ok,
      erro: resultado.erro ?? null,
    }).eq('id', log.id);
  }
  if (parte) {
    await supabase.from('saipos_fila').update({
      em_andamento_desde: null,
      concluido_em: resultado.ok ? new Date().toISOString() : null,
      ultimo_erro: resultado.erro ?? null,
    }).eq('dia', dia).eq('parte', parte);
  }
  return resultado;
}

Deno.serve(async (req) => {
  const chave = req.headers.get('x-sync-key') ?? '';
  const { data: autorizado } = await supabase.rpc('sync_chave_valida', { p_chave: chave });
  if (!autorizado) return new Response('Não autorizado', { status: 401 });

  const token = Deno.env.get('SAIPOS_TOKEN')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return new Response('Segredo SAIPOS_TOKEN não cadastrado', { status: 500 });

  const corpo = await req.json().catch(() => ({}));
  const dia = String(corpo.dia ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return new Response('Informe {"dia": "AAAA-MM-DD"}', { status: 400 });
  const parte = corpo.parte === 'vendas' || corpo.parte === 'itens' ? corpo.parte : null;

  return Response.json(await sincronizarDia(dia, parte, token));
});
