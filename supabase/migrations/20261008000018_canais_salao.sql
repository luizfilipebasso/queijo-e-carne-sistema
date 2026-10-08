-- Faturamento por canal (Painel): pedidos de salão separados (decisão do dono, 08/10/2026).
--   * "Totem iFood" = salão que veio pelo iFood (2 totens do iFood no salão de SP);
--   * "Ficha Salão" = salão sem plataforma (antes caía em WhatsApp/telefone).
-- Só muda o agrupamento do Painel; a coluna canal das vendas continua a da Saipos.
do $$
declare
  v_def text;
  v_novo text;
begin
  v_def := pg_get_functiondef('public.painel_mes(text,date)'::regprocedure);
  v_novo := replace(v_def,
    $a$(select canal, sum(total) fat, count(*) n from vendas group by canal)$a$,
    $b$(select canal_painel as canal, sum(total) fat, count(*) n from (
                           select v.*, case
                             when v.tipo = 'salao' and v.canal = 'ifood' then 'totem_ifood'
                             when v.tipo = 'salao' and v.canal = 'telefone' then 'ficha_salao'
                             else v.canal end as canal_painel
                           from vendas v) vc group by canal_painel)$b$);
  if v_novo = v_def then raise exception 'painel_mes: trecho dos canais não encontrado'; end if;
  execute v_novo;
end
$$;
