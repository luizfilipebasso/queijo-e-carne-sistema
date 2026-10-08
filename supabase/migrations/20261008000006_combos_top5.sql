-- Composição dos combos passa a mostrar os 5 primeiros de cada bloco (hambúrguer, bebida, adicional),
-- igual a "Produtos mais vendidos" e "Burgers mais vendidos" (pedido do dono, 08/10/2026).
-- Em painel_mes, os únicos "limit 3" são os três blocos dos combos.
do $$
declare
  v_def text := pg_get_functiondef('public.painel_mes(text, date)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, 'limit 3', ''))) / length('limit 3') <> 3 then
    raise exception 'painel_mes mudou: revise antes de aplicar.';
  end if;
  execute replace(v_def, 'limit 3', 'limit 5');
end
$$;
