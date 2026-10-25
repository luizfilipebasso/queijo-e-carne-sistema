-- Total de hambúrgueres vendidos no mês (avulsos + dentro de combos), mostrado ao lado dos pedidos
-- no destaque do faturamento (pedido do dono, 25/10/2026). Mesma conta do bloco "Burgers mais vendidos".
do $$
declare
  v_def text := pg_get_functiondef('public.painel_mes(text,date)'::regprocedure);
  v_novo text;
begin
  if (length(v_def) - length(replace(v_def, $a$'burgers', coalesce($a$, ''))) / length($a$'burgers', coalesce($a$) <> 1 then
    raise exception 'painel_mes: trecho dos burgers não encontrado (ou repetido)';
  end if;
  v_novo := replace(v_def,
    $a$'burgers', coalesce($a$,
    $b$'burgers_vendidos', (select sum(qtd) from burgers),
    'burgers', coalesce($b$);
  execute v_novo;
end
$$;
