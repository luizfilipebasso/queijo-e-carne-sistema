-- Avisos para dono e gerente (dono, 10/11/2026), mostrados no topo do Painel e dos Lançamentos:
--   * a Saipos parou de atualizar (nenhuma busca com sucesso há mais de 30 horas; a busca diária é às 06h);
--   * lançamentos pendentes do mês atual e do anterior: dias com vendas sem "erros do dia", quinzenas
--     encerradas sem CMV ou sem notas, e mês anterior com menos de 2 visitas da nutricionista.
-- "Ontem" é o último dia comercial completo (o turno vira às 07h de Brasília, como no robô).

create function public.avisos(p_unidade text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ontem date := ((now() at time zone 'America/Sao_Paulo') - interval '7 hours')::date - 1;
  v_mes date := date_trunc('month', v_ontem + 1)::date;
  v_inicio date;
  v_ultima_ok timestamptz;
  v_resultado jsonb;
begin
  if not private.eh_equipe(p_unidade) then
    raise exception 'Acesso restrito ao dono e à gerência desta unidade.';
  end if;

  -- Janela: mês atual e o anterior, sem passar do primeiro dia com vendas da unidade.
  select greatest((v_mes - interval '1 month')::date, min(data)) into v_inicio
  from public.saipos_vendas where unidade = p_unidade;
  select max(terminado_em) into v_ultima_ok from public.saipos_sincronizacoes where unidade = p_unidade and ok;

  with quinzenas as (
    select q::date as inicio
    from generate_series(date_trunc('month', v_inicio), v_mes, interval '1 month') m
    cross join lateral (values (m), (m + interval '15 days')) as x(q)
    where case when extract(day from q) = 1 then (q + interval '14 days')::date
               else (date_trunc('month', q) + interval '1 month - 1 day')::date end <= v_ontem
      and q::date >= date_trunc('month', v_inicio)::date
  )
  select jsonb_build_object(
    'saipos', jsonb_build_object(
      'ultima_ok', v_ultima_ok,
      'atrasada', v_ultima_ok is null or now() - v_ultima_ok > interval '30 hours',
      'ultimo_erro', (select s.erro from public.saipos_sincronizacoes s
                      where s.unidade = p_unidade order by s.iniciado_em desc limit 1)),
    'erros_sem_lancar', coalesce((
      select jsonb_agg(d.dia order by d.dia)
      from (select distinct v.data as dia from public.saipos_vendas v
            where v.unidade = p_unidade and v.data between v_inicio and v_ontem and not v.cancelada) d
      where not exists (select 1 from public.erros_diarios e where e.unidade = p_unidade and e.data = d.dia)), '[]'::jsonb),
    'cmv_sem_lancar', coalesce((
      select jsonb_agg(q.inicio order by q.inicio) from quinzenas q
      where not exists (select 1 from public.cmv_quinzena c
                        where c.unidade = p_unidade and c.inicio = q.inicio and c.cmv_pct is not null)), '[]'::jsonb),
    'notas_sem_lancar', coalesce((
      select jsonb_agg(q.inicio order by q.inicio) from quinzenas q
      where not exists (select 1 from public.notas_quinzena n
                        where n.unidade = p_unidade and n.inicio = q.inicio)), '[]'::jsonb),
    -- Nutricionista: só cobra o mês que já terminou (são 2 visitas por mês).
    'nutri_faltando', case when (v_mes - interval '1 month')::date >= date_trunc('month', v_inicio)::date then
      jsonb_build_object('mes', (v_mes - interval '1 month')::date,
        'visitas', (select count(*) from public.nutri_visitas n
                    where n.unidade = p_unidade and n.mes = (v_mes - interval '1 month')::date and n.nota_pct is not null))
      end
  ) into v_resultado;
  return v_resultado;
end
$$;
revoke all on function public.avisos(text) from public, anon;
grant execute on function public.avisos(text) to authenticated;
