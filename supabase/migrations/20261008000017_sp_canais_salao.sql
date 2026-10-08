-- São Paulo (decisões do dono, 08/10/2026):
--   * canais novos: Keeta, 99 Food e Site Delivery (Saipos); SP não tem Alloy nem Delivery Much;
--   * tipo de venda 4 da Saipos (pedido com ficha) = Salão (gente comendo no salão). Balcão = retirada, Delivery = entrega.
--     SM não tem salão. O ticket médio ganha a coluna Salão (sem meta).
-- A Edge Function passa a gravar canal 'keeta' / '99food' / 'site' e tipo 'salao'; aqui ajusto o que já foi gravado
-- (o tipo 4 vem da Saipos; as vendas de SP são buscadas de novo depois desta mudança).

update public.saipos_vendas set canal = case canal_original
    when 'Keeta' then 'keeta' when '99 Food' then '99food' when 'Site Delivery (SAIPOS)' then 'site' end
where canal = 'outro' and canal_original in ('Keeta', '99 Food', 'Site Delivery (SAIPOS)');

-- Ticket médio do Salão no Painel e no Comparar (mesma regra: sem cancelados e sem fiado).
do $$
declare
  v_def text;
  v_novo text;
begin
  v_def := pg_get_functiondef('public.painel_mes(text,date)'::regprocedure);
  v_novo := replace(v_def,
    $a$'delivery', (select jsonb_build_object('valor', round(avg(total), 2), 'pedidos', count(*)) from vendas where tipo = 'delivery' and not fiado)$a$,
    $b$'delivery', (select jsonb_build_object('valor', round(avg(total), 2), 'pedidos', count(*)) from vendas where tipo = 'delivery' and not fiado),
      'salao', (select jsonb_build_object('valor', round(avg(total), 2), 'pedidos', count(*)) from vendas where tipo = 'salao' and not fiado)$b$);
  if v_novo = v_def then raise exception 'painel_mes: trecho do ticket não encontrado'; end if;
  execute v_novo;

  v_def := pg_get_functiondef('public.comparativo_mes(date)'::regprocedure);
  v_novo := replace(v_def,
    $a$round(avg(v.total) filter (where v.tipo = 'delivery' and not v.fiado), 2) as ticket_delivery,$a$,
    $b$round(avg(v.total) filter (where v.tipo = 'delivery' and not v.fiado), 2) as ticket_delivery,
      round(avg(v.total) filter (where v.tipo = 'salao' and not v.fiado), 2) as ticket_salao,$b$);
  v_novo := replace(v_novo,
    $a$'ticket_balcao', l.ticket_balcao, 'ticket_delivery', l.ticket_delivery,$a$,
    $b$'ticket_balcao', l.ticket_balcao, 'ticket_delivery', l.ticket_delivery, 'ticket_salao', l.ticket_salao,$b$);
  v_novo := replace(v_novo,
    $a$'ticket_delivery', round(avg(total) filter (where tipo = 'delivery' and not fiado), 2),$a$,
    $b$'ticket_delivery', round(avg(total) filter (where tipo = 'delivery' and not fiado), 2),
        'ticket_salao', round(avg(total) filter (where tipo = 'salao' and not fiado), 2),$b$);
  if (length(v_novo) - length(v_def)) < 150 then raise exception 'comparativo_mes: trechos do ticket não encontrados'; end if;
  execute v_novo;
end
$$;

update public.unidades set turno = '11h às 02h' where codigo = 'SP';
