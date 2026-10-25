-- Novo indicador "Burgers vendidos" (dono, 25/10/2026): só Santa Maria, desde outubro de 2026.
-- Meta 7.000 → R$ 60; super meta 8.000 → R$ 120; para todos (Cozinha e Atendimento).
-- A contagem é a mesma do total do Painel: burgers avulsos (× unidades, ex.: "2x Double CBB" = 2)
-- + burgers escolhidos dentro de combos; sem lanches DIA de funcionário e sem cancelados.

alter table public.metas drop constraint metas_indicador_check;
alter table public.metas add constraint metas_indicador_check check (indicador in
  ('cmv', 'ifood', 'f99', 'keeta', 'nutri', 'erros', 'erros_cozinha', 'erros_atendimento',
   'aguardando', 'cozinha', 'burgers', 'ticket_balcao', 'ticket_delivery'));

insert into public.metas (unidade, indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico)
values ('SM', 'burgers', date '2026-10-01', 7000, 8000, true, 60, 120, 'todos');

create function private.burgers_vendidos(p_unidade text, p_inicio date, p_fim date) returns numeric
language sql stable set search_path = ''
as $$
  with itens as (
    select i.* from public.saipos_itens i
    join public.saipos_vendas v using (unidade, id_sale)
    where v.unidade = p_unidade and v.data between p_inicio and p_fim and not v.cancelada and not i.apagado
  )
  select coalesce((
    select sum(i.quantidade * c.unidades) from itens i
    cross join lateral private.classificar(p_unidade, i.descricao) c
    where c.grupo = 'burger' and not private.eh_item_dia(i.descricao)
  ), 0) + coalesce((
    select sum(i.quantidade * c.unidades) from itens i
    cross join jsonb_array_elements(i.escolhas) e
    cross join lateral private.classificar(p_unidade, e->>'descricao') c
    where c.grupo = 'burger'
  ), 0)
$$;
revoke all on function private.burgers_vendidos(text, date, date) from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.indicadores_mes(text,date)'::regprocedure);
  v_trecho text := $a$'pedidos', (select count(*) from public.saipos_vendas where unidade = p_unidade and data between v_inicio and v_fim and not cancelada),$a$;
begin
  if position(v_trecho in v_def) = 0 then raise exception 'indicadores_mes: trecho dos pedidos não encontrado'; end if;
  execute replace(v_def, v_trecho, v_trecho || $b$
    'burgers_vendidos', private.burgers_vendidos(p_unidade, v_inicio, v_fim),$b$);
end
$$;
