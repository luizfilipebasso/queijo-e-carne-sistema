-- Cálculos do Painel e dos Indicadores, feitos no banco a partir dos dados da Saipos e dos lançamentos.

-- ---------- Classificação do cardápio ----------
-- Diz o que é hambúrguer (e qual sabor) e o que é bebida, tanto em itens avulsos quanto nas escolhas dos combos.
-- A primeira regra que casar vale (menor "ordem"). "unidades": quantos burgers aquele item representa.
create table public.catalogo (
  ordem integer primary key,
  padrao text not null,                     -- expressão regular, sem diferenciar maiúsculas
  grupo text not null check (grupo in ('burger', 'bebida')),
  nome text,                                -- sabor padronizado (burgers); bebidas usam o texto da Saipos
  unidades integer not null default 1
);
insert into public.catalogo (ordem, padrao, grupo, nome, unidades) values
  (10, '^2 salada bacon', 'burger', 'Salada Bacon', 2),
  (11, '^2x double cbb', 'burger', 'Double CBB', 2),
  (20, '^double cbb', 'burger', 'Double CBB', 1),
  (21, '^double flip', 'burger', 'Double Flip', 1),
  (22, '^double tex', 'burger', 'Double Tex', 1),
  (23, '^salada bacon', 'burger', 'Salada Bacon', 1),
  (24, '^salada barbecue', 'burger', 'Salada Barbecue', 1),
  (25, '^cheddar bacon', 'burger', 'Cheddar Bacon', 1),
  (26, '^gordon blue', 'burger', 'Gordon Blue', 1),
  (27, '^melt bacon', 'burger', 'Melt Bacon', 1),
  (28, '^che+s+e egg', 'burger', 'Cheese Egg', 1),
  (29, '^chicken (n|ch)', 'burger', 'Chicken n'' Cheese', 1),
  (30, '^queijo e carne( cheddar| mussarela)?$', 'burger', 'Queijo e Carne', 1),
  (31, '^vegetariano', 'burger', 'Vegetariano', 1),
  (50, '^(coca|fanta|sprite|[aá]gua|suco|monster|monter|guaran|h2oh|schweppes|2 latas)', 'bebida', null, 1);
alter table public.catalogo enable row level security;
create policy "equipe vê" on public.catalogo for select to authenticated using ((select private.eh_equipe()));

create function private.classificar(p_descricao text)
returns table (grupo text, nome text, unidades integer)
language sql stable set search_path = ''
as $$
  select c.grupo, coalesce(c.nome, p_descricao), c.unidades
  from public.catalogo c
  where p_descricao ~* c.padrao
  order by c.ordem
  limit 1
$$;

-- Itens DIA (lanche de funcionário) ficam fora dos mais vendidos.
create function private.eh_item_dia(p_descricao text) returns boolean
language sql immutable set search_path = ''
as $$ select p_descricao ~* '^dia ?-' $$;

-- ---------- Painel (só dono e gerente) ----------
create function public.painel_mes(p_mes date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_resultado jsonb;
begin
  if not private.eh_equipe() then
    raise exception 'Acesso restrito ao dono e à gerente.';
  end if;

  with vendas as (
    select * from public.saipos_vendas where data between v_inicio and v_fim and not cancelada
  ),
  itens as (
    select i.*, i.quantidade * (i.preco_unitario + coalesce((select sum((e->>'preco')::numeric) from jsonb_array_elements(i.escolhas) e), 0)) as receita
    from public.saipos_itens i join vendas v using (id_sale)
    where not i.apagado
  ),
  escolhas as (
    select i.descricao as item, i.quantidade, e->>'descricao' as escolha, c.grupo, c.nome, c.unidades
    from itens i
    cross join jsonb_array_elements(i.escolhas) e
    left join lateral private.classificar(e->>'descricao') c on true
  ),
  -- Itens em que o cliente escolhe o hambúrguer: é a "composição dos combos".
  combos as (
    select distinct item from escolhas where grupo = 'burger'
  ),
  burgers as (
    select c.nome, sum(i.quantidade * c.unidades) as qtd
    from itens i cross join lateral private.classificar(i.descricao) c
    where c.grupo = 'burger' and not private.eh_item_dia(i.descricao)
    group by c.nome
    union all
    select nome, sum(quantidade * unidades) from escolhas where grupo = 'burger' group by nome
  ),
  ultimo_dia as (
    select max(data) as dia from vendas
  )
  select jsonb_build_object(
    'mes', v_inicio,
    'atualizado_ate', (select dia from ultimo_dia),
    'faturamento', coalesce((select sum(total) from vendas), 0),
    'pedidos', (select count(*) from vendas),
    'ultimo_dia', (select jsonb_build_object('data', dia, 'faturamento', (select sum(total) from vendas where data = dia)) from ultimo_dia),
    'canais', coalesce((select jsonb_agg(jsonb_build_object('canal', canal, 'faturamento', fat, 'pedidos', n) order by fat desc)
                         from (select canal, sum(total) fat, count(*) n from vendas group by canal) x), '[]'),
    'ticket', jsonb_build_object(
      'balcao', (select jsonb_build_object('valor', round(avg(total), 2), 'pedidos', count(*)) from vendas where tipo = 'balcao' and not fiado),
      'delivery', (select jsonb_build_object('valor', round(avg(total), 2), 'pedidos', count(*)) from vendas where tipo = 'delivery' and not fiado)
    ),
    'produtos', coalesce((select jsonb_agg(x order by x.receita desc) from (
        select descricao as nome, sum(quantidade) as qtd, round(sum(receita), 2) as receita
        from itens where not private.eh_item_dia(descricao)
        group by descricao order by sum(receita) desc limit 5) x), '[]'),
    'burgers', coalesce((select jsonb_agg(x order by x.qtd desc) from (
        select nome, sum(qtd) as qtd from burgers group by nome order by sum(qtd) desc limit 5) x), '[]'),
    'combos', jsonb_build_object(
      'total', (select sum(i.quantidade) from itens i where i.descricao in (select item from combos)),
      'burger', coalesce((select jsonb_agg(x order by x.qtd desc) from (
          select nome, sum(quantidade) qtd from escolhas where item in (select item from combos) and grupo = 'burger'
          group by nome order by 2 desc limit 3) x), '[]'),
      'bebida', coalesce((select jsonb_agg(x order by x.qtd desc) from (
          select escolha as nome, sum(quantidade) qtd from escolhas where item in (select item from combos) and grupo = 'bebida'
          group by escolha order by 2 desc limit 3) x), '[]'),
      'adicional', coalesce((select jsonb_agg(x order by x.qtd desc) from (
          select escolha as nome, sum(quantidade) qtd from escolhas where item in (select item from combos) and grupo is null
          group by escolha order by 2 desc limit 3) x), '[]'),
      'adicionais_total', (select sum(quantidade) from escolhas where item in (select item from combos) and grupo is null),
      'bebidas_total', (select sum(quantidade) from escolhas where item in (select item from combos) and grupo = 'bebida'),
      'burgers_total', (select sum(quantidade) from escolhas where item in (select item from combos) and grupo = 'burger')
    )
  ) into v_resultado;

  return v_resultado;
end
$$;

-- ---------- Indicadores (todas as pessoas ativas; sem faturamento) ----------
create function public.indicadores_mes(p_mes date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_resultado jsonb;
begin
  if private.meu_papel() is null then
    raise exception 'Acesso negado.';
  end if;

  with entregas as (
    select * from public.saipos_vendas
    where data between v_inicio and v_fim and not cancelada and not fiado and tipo = 'delivery'
  ),
  erros as (
    select * from public.erros_diarios where data between v_inicio and v_fim
  ),
  cmv as (
    select * from public.cmv_quinzena where inicio between v_inicio and v_fim
  )
  select jsonb_build_object(
    'mes', v_inicio,
    'mes_encerrado', v_fim < v_hoje,
    'atualizado_ate', (select max(data) from public.saipos_vendas where data between v_inicio and v_fim),
    'pedidos', (select count(*) from public.saipos_vendas where data between v_inicio and v_fim and not cancelada),
    -- Regra do dono (07/10/2026): pedido com mais de 40 min na cozinha fica fora da média de cozinha.
    'cozinha', (select jsonb_build_object(
        'segundos', round(avg(seg_cozinha) filter (where seg_cozinha <= 2400)),
        'pedidos', count(*) filter (where seg_cozinha <= 2400),
        'excluidos', count(*) filter (where seg_cozinha > 2400))
      from entregas where seg_cozinha is not null),
    'aguardando', (select jsonb_build_object('segundos', round(avg(seg_aguardando_entrega)), 'pedidos', count(*))
      from entregas where seg_aguardando_entrega is not null),
    'erros', (select jsonb_build_object(
        'dias_lancados', count(*),
        'qtd_cozinha', coalesce(sum(erros_cozinha), 0),
        'qtd_atendimento', coalesce(sum(erros_atendimento), 0),
        'custo_cozinha', coalesce(sum(custo_cozinha), 0),
        'custo_atendimento', coalesce(sum(custo_atendimento), 0))
      from erros),
    'notas', coalesce((select jsonb_agg(to_jsonb(n) - 'atualizado_por' order by inicio)
      from public.notas_quinzena n where inicio between v_inicio and v_fim), '[]'),
    'cmv', coalesce((select jsonb_agg(jsonb_build_object('inicio', inicio, 'cmv_pct', cmv_pct,
        'estoque_inicial', estoque_inicial, 'estoque_final', estoque_final) order by inicio) from cmv), '[]'),
    'mes_fechado', v_fim < v_hoje and (select count(*) from cmv where cmv_pct is not null) = 2,
    'nutri', coalesce((select jsonb_agg(jsonb_build_object('visita', visita, 'data', data_visita, 'nota', nota_pct) order by visita)
      from public.nutri_visitas where mes = v_inicio), '[]')
  ) into v_resultado;

  return v_resultado;
end
$$;

revoke all on function public.painel_mes(date), public.indicadores_mes(date) from public, anon;
grant execute on function public.painel_mes(date), public.indicadores_mes(date) to authenticated;
revoke all on function private.classificar(text), private.eh_item_dia(text) from public, anon;
grant execute on function private.classificar(text), private.eh_item_dia(text) to authenticated;
