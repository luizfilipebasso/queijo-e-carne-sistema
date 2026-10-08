-- Conferência de SP com as planilhas da Saipos (08/10/2026) e decisões do dono:
--   1. "Aguardando entregador": entregas com mais de 30 min esperando entregador ficam fora da média
--      (parâmetro aguardando_limite_seg por unidade; SP = 1800). Sem o parâmetro, não há limite.
--   2. Produtos mais vendidos: nomes que só mudam maiúsculas/minúsculas viram um produto só
--      (ex.: "Combo Individual (Serve 1 Pessoa)" e "(Serve 1 pessoa)"), como a Saipos agrupa.

insert into public.parametros (unidade, chave, vale_a_partir_de, valor) values
  ('SP', 'aguardando_limite_seg', date '2026-10-01', 1800);

do $$
declare
  v_def text;
  v_novo text;
begin
  -- indicadores_mes: média do aguardando com limite + quantos ficaram fora.
  v_def := pg_get_functiondef('public.indicadores_mes(text,date)'::regprocedure);
  v_novo := replace(v_def,
    $a$'aguardando', (select jsonb_build_object('segundos', round(avg(seg_aguardando_entrega)), 'pedidos', count(*))
      from entregas where seg_aguardando_entrega is not null),$a$,
    $b$'aguardando', (select jsonb_build_object(
        'segundos', round(avg(seg_aguardando_entrega) filter (where seg_aguardando_entrega <= l.lim)),
        'pedidos', count(*) filter (where seg_aguardando_entrega <= l.lim),
        'excluidos', count(*) filter (where seg_aguardando_entrega > l.lim),
        'limite_seg', private.parametro(p_unidade, 'aguardando_limite_seg', v_fim))
      from entregas, (select coalesce(private.parametro(p_unidade, 'aguardando_limite_seg', v_fim), 1000000000) as lim) l
      where seg_aguardando_entrega is not null),$b$);
  if v_novo = v_def then raise exception 'indicadores_mes: trecho do aguardando não encontrado'; end if;
  execute v_novo;

  -- comparativo_mes: mesmo limite por unidade e no total.
  v_def := pg_get_functiondef('public.comparativo_mes(date)'::regprocedure);
  v_novo := replace(v_def,
    $a$coalesce(private.parametro(codigo, 'cozinha_limite_seg', v_fim), 2400) as limite$a$,
    $b$coalesce(private.parametro(codigo, 'cozinha_limite_seg', v_fim), 2400) as limite,
      coalesce(private.parametro(codigo, 'aguardando_limite_seg', v_fim), 1000000000) as limite_ag$b$);
  v_novo := replace(v_novo, $a$select v.*, u.limite from$a$, $b$select v.*, u.limite, u.limite_ag from$b$);
  v_novo := replace(v_novo,
    $a$round(avg(v.seg_aguardando_entrega) filter (where v.tipo = 'delivery' and not v.fiado)) as seg_aguardando$a$,
    $b$round(avg(v.seg_aguardando_entrega) filter (where v.tipo = 'delivery' and not v.fiado and v.seg_aguardando_entrega <= v.limite_ag)) as seg_aguardando$b$);
  v_novo := replace(v_novo,
    $a$'seg_aguardando', round(avg(seg_aguardando_entrega) filter (where tipo = 'delivery' and not fiado)),$a$,
    $b$'seg_aguardando', round(avg(seg_aguardando_entrega) filter (where tipo = 'delivery' and not fiado and seg_aguardando_entrega <= limite_ag)),$b$);
  if (length(v_novo) - length(replace(v_novo, 'limite_ag', ''))) / length('limite_ag') <> 4 then raise exception 'comparativo_mes: trechos não encontrados'; end if;
  execute v_novo;

  -- painel_mes: produtos agrupados sem diferenciar maiúsculas.
  v_def := pg_get_functiondef('public.painel_mes(text,date)'::regprocedure);
  v_novo := replace(v_def,
    $a$select descricao as nome, sum(quantidade) as qtd, round(sum(receita), 2) as receita
        from itens where not private.eh_item_dia(descricao)
        group by descricao order by sum(receita) desc limit 5$a$,
    $b$select min(descricao) as nome, sum(quantidade) as qtd, round(sum(receita), 2) as receita
        from itens where not private.eh_item_dia(descricao)
        group by lower(descricao) order by sum(receita) desc limit 5$b$);
  if v_novo = v_def then raise exception 'painel_mes: trecho dos produtos não encontrado'; end if;
  execute v_novo;
end
$$;

-- Ajuste (mesmo dia): o nome mostrado é a variante mais vendida, não a "menor" em ordem alfabética.
do $$
declare
  v_def text := pg_get_functiondef('public.painel_mes(text,date)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    $a$select min(descricao) as nome, sum(quantidade) as qtd$a$,
    $b$select (array_agg(descricao order by quantidade desc))[1] as nome, sum(quantidade) as qtd$b$);
  if v_novo = v_def then raise exception 'painel_mes: trecho não encontrado'; end if;
  execute v_novo;
end
$$;
