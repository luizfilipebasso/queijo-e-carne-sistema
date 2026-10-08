-- Painel: devolve também os últimos 3 dias com vendas no mês (data, faturamento, pedidos),
-- mostrados no cartão de faturamento (pedido do dono, 08/10/2026).
do $$
declare
  v_def text := pg_get_functiondef('public.painel_mes(text, date)'::regprocedure);
  v_ancora text := $a$'pedidos', (select count(*) from vendas),$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'painel_mes mudou: revise antes de aplicar.';
  end if;
  execute replace(v_def, v_ancora, v_ancora || $a$
    'ultimos_dias', coalesce((select jsonb_agg(jsonb_build_object('data', data, 'faturamento', fat, 'pedidos', n) order by data desc)
                              from (select data, sum(total) fat, count(*) n from vendas group by data order by data desc limit 3) x), '[]'),$a$);
end
$$;
