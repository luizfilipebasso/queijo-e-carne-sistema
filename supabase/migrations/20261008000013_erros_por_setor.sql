-- Erros separados por setor (decisão do dono, 08/10/2026):
--   * "Erros cozinha" vale só para a Cozinha e "Erros atendimento" só para o Atendimento;
--   * percentual de cada um = erros do setor no mês ÷ total de pedidos do mês;
--   * mesmas metas de antes (≤ 1,5% / ≤ 0,8%, R$ 50 / R$ 100), agora por setor;
--   * o prêmio do topo já sai com o desconto do custo dos erros do setor ÷ pessoas do setor.
-- indicadores_mes passa a devolver quantas pessoas de cada setor contam no mês.

alter table public.metas drop constraint metas_indicador_check;

insert into public.metas (unidade, indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico)
select unidade, 'erros_atendimento', vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, 'atendimento'
from public.metas where indicador = 'erros';
update public.metas set indicador = 'erros_cozinha', publico = 'cozinha' where indicador = 'erros';
alter table public.metas add constraint metas_indicador_check check (indicador in
  ('cmv', 'ifood', 'f99', 'nutri', 'erros_cozinha', 'erros_atendimento', 'aguardando', 'cozinha', 'ticket_balcao', 'ticket_delivery'));

-- Pessoas de um setor que contam no mês (quem entrou ou saiu no meio do mês conta inteiro).
create function private.pessoas_do_setor(p_unidade text, p_setor text, p_inicio date, p_fim date) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.pessoa_unidades v
  join public.pessoas p on p.id = v.pessoa_id
  where v.unidade = p_unidade and v.papel = 'funcionario' and v.setor = p_setor
    and v.data_inicio <= p_fim
    and (v.data_fim >= p_inicio or (v.data_fim is null and v.ativo and p.ativo))
$$;
revoke all on function private.pessoas_do_setor(text, text, date, date) from public, anon, authenticated;

create or replace function public.indicadores_mes(p_unidade text, p_mes date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_limite numeric := coalesce(private.parametro(p_unidade, 'cozinha_limite_seg', (date_trunc('month', p_mes) + interval '1 month - 1 day')::date), 2400);
  v_resultado jsonb;
begin
  if not private.pode_ver(p_unidade) then
    raise exception 'Acesso negado.';
  end if;

  with entregas as (
    select * from public.saipos_vendas
    where unidade = p_unidade and data between v_inicio and v_fim and not cancelada and not fiado and tipo = 'delivery'
  ),
  erros as (
    select * from public.erros_diarios where unidade = p_unidade and data between v_inicio and v_fim
  ),
  cmv as (
    select * from public.cmv_quinzena where unidade = p_unidade and inicio between v_inicio and v_fim
  )
  select jsonb_build_object(
    'unidade', p_unidade,
    'mes', v_inicio,
    'metas', private.metas_vigentes(p_unidade, v_fim),
    'cozinha_limite_seg', v_limite,
    'mes_encerrado', v_fim < v_hoje,
    'atualizado_ate', (select max(data) from public.saipos_vendas where unidade = p_unidade and data between v_inicio and v_fim),
    'pedidos', (select count(*) from public.saipos_vendas where unidade = p_unidade and data between v_inicio and v_fim and not cancelada),
    'cozinha', (select jsonb_build_object(
        'segundos', round(avg(seg_cozinha) filter (where seg_cozinha <= v_limite)),
        'pedidos', count(*) filter (where seg_cozinha <= v_limite),
        'excluidos', count(*) filter (where seg_cozinha > v_limite))
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
    'funcionarios', jsonb_build_object(
        'cozinha', private.pessoas_do_setor(p_unidade, 'cozinha', v_inicio, v_fim),
        'atendimento', private.pessoas_do_setor(p_unidade, 'atendimento', v_inicio, v_fim)),
    'notas', coalesce((select jsonb_agg(jsonb_build_object('inicio', inicio, 'nota_ifood', nota_ifood, 'nota_99food', nota_99food) order by inicio)
      from public.notas_quinzena where unidade = p_unidade and inicio between v_inicio and v_fim), '[]'),
    'cmv', coalesce((select jsonb_agg(jsonb_build_object('inicio', inicio, 'cmv_pct', cmv_pct,
        'estoque_inicial', estoque_inicial, 'estoque_final', estoque_final) order by inicio) from cmv), '[]'),
    'mes_fechado', v_fim < v_hoje and (select count(*) from cmv where cmv_pct is not null) = 2,
    'nutri', coalesce((select jsonb_agg(jsonb_build_object('visita', visita, 'data', data_visita, 'nota', nota_pct) order by visita)
      from public.nutri_visitas where unidade = p_unidade and mes = v_inicio), '[]')
  ) into v_resultado;
  return v_resultado;
end
$function$;

create or replace function public.comparativo_mes(p_mes date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_resultado jsonb;
begin
  with unid as (
    select codigo, nome, ordem, coalesce(private.parametro(codigo, 'cozinha_limite_seg', v_fim), 2400) as limite
    from public.unidades where private.eh_equipe(codigo)
  ),
  vendas as (
    select v.*, u.limite from public.saipos_vendas v join unid u on u.codigo = v.unidade
    where v.data between v_inicio and v_fim and not v.cancelada
  ),
  erros as (
    select e.unidade, sum(e.erros_cozinha) as qtd_cozinha, sum(e.erros_atendimento) as qtd_atendimento, count(*) as dias
    from public.erros_diarios e join unid u on u.codigo = e.unidade
    where e.data between v_inicio and v_fim group by e.unidade
  ),
  cmv as (
    select c.unidade, avg(c.cmv_pct) as media from public.cmv_quinzena c join unid u on u.codigo = c.unidade
    where c.inicio between v_inicio and v_fim and c.cmv_pct is not null group by c.unidade
  ),
  linhas as (
    select u.codigo as unidade, u.nome, u.ordem,
      coalesce(sum(v.total), 0) as faturamento,
      count(v.id_sale) as pedidos,
      round(avg(v.total) filter (where v.tipo = 'balcao' and not v.fiado), 2) as ticket_balcao,
      round(avg(v.total) filter (where v.tipo = 'delivery' and not v.fiado), 2) as ticket_delivery,
      round(avg(v.seg_cozinha) filter (where v.tipo = 'delivery' and not v.fiado and v.seg_cozinha <= v.limite)) as seg_cozinha,
      round(avg(v.seg_aguardando_entrega) filter (where v.tipo = 'delivery' and not v.fiado)) as seg_aguardando,
      max(v.data) as atualizado_ate
    from unid u left join vendas v on v.unidade = u.codigo
    group by u.codigo, u.nome, u.ordem
  )
  select jsonb_build_object(
    'mes', v_inicio,
    'unidades', coalesce((select jsonb_agg(jsonb_build_object(
        'unidade', l.unidade, 'nome', l.nome, 'faturamento', l.faturamento, 'pedidos', l.pedidos,
        'ticket_balcao', l.ticket_balcao, 'ticket_delivery', l.ticket_delivery,
        'seg_cozinha', l.seg_cozinha, 'seg_aguardando', l.seg_aguardando, 'atualizado_ate', l.atualizado_ate,
        'cmv', (select round(media, 2) from cmv where cmv.unidade = l.unidade),
        'erros_cozinha_pct', (select case when e.dias > 0 and l.pedidos > 0 then round(e.qtd_cozinha * 100.0 / l.pedidos, 2) end from erros e where e.unidade = l.unidade),
        'erros_atendimento_pct', (select case when e.dias > 0 and l.pedidos > 0 then round(e.qtd_atendimento * 100.0 / l.pedidos, 2) end from erros e where e.unidade = l.unidade),
        'metas', private.metas_vigentes(l.unidade, v_fim)
      ) order by l.ordem) from linhas l), '[]'),
    'total', (select jsonb_build_object(
        'faturamento', coalesce(sum(total), 0),
        'pedidos', count(*),
        'ticket_balcao', round(avg(total) filter (where tipo = 'balcao' and not fiado), 2),
        'ticket_delivery', round(avg(total) filter (where tipo = 'delivery' and not fiado), 2),
        'seg_cozinha', round(avg(seg_cozinha) filter (where tipo = 'delivery' and not fiado and seg_cozinha <= limite)),
        'seg_aguardando', round(avg(seg_aguardando_entrega) filter (where tipo = 'delivery' and not fiado)),
        'erros_cozinha_pct', case when (select sum(dias) from erros) > 0 and count(*) > 0
                       then round((select sum(qtd_cozinha) from erros) * 100.0 / count(*), 2) end,
        'erros_atendimento_pct', case when (select sum(dias) from erros) > 0 and count(*) > 0
                       then round((select sum(qtd_atendimento) from erros) * 100.0 / count(*), 2) end
      ) from vendas)
  ) into v_resultado;
  return v_resultado;
end
$function$;
