-- Fechamento do mês (dono, 10/11/2026):
--   * só o dono fecha e reabre o mês de uma unidade (public.fechar_mes / public.reabrir_mes);
--   * ao fechar, o resultado do mês (retorno de indicadores_mes) e o prêmio final de cada setor ficam gravados:
--     o Desempenho de um mês fechado mostra sempre esse retrato, mesmo que metas, cardápio ou parâmetros mudem;
--   * com o mês fechado, ninguém lança, corrige ou apaga erros, CMV, notas e nutricionista daquele mês;
--   * toda alteração nesses lançamentos (e cada fechamento/reabertura) fica registrada em public.alteracoes.

create table public.fechamentos (
  unidade text not null references public.unidades (codigo),
  mes date not null check (extract(day from mes) = 1),
  fechado_em timestamptz not null default now(),
  fechado_por uuid references auth.users (id) on delete set null,
  fechado_por_nome text not null,
  dados jsonb not null,
  -- {"cozinha": {"bruto": 0, "desconto": 0, "liquido": 0}, "atendimento": {...}, "producao": {...}}
  premios jsonb not null,
  primary key (unidade, mes)
);
create index fechamentos_fechado_por on public.fechamentos (fechado_por);

create table public.alteracoes (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  por uuid references auth.users (id) on delete set null,
  por_nome text,
  unidade text not null references public.unidades (codigo),
  tabela text not null,
  referencia text not null,
  operacao text not null check (operacao in ('incluiu', 'alterou', 'apagou', 'fechou', 'reabriu')),
  antes jsonb,
  depois jsonb
);
create index alteracoes_recentes on public.alteracoes (unidade, em desc);
create index alteracoes_por on public.alteracoes (por);

-- Só leitura pelo site; quem grava são as funções e os gatilhos abaixo.
alter table public.fechamentos enable row level security;
alter table public.alteracoes enable row level security;
create policy "quem é da unidade vê" on public.fechamentos for select to authenticated
using (private.pode_ver(unidade));
create policy "equipe da unidade vê" on public.alteracoes for select to authenticated
using (private.eh_equipe(unidade));

-- Mês a que o lançamento pertence: erros (data), CMV e notas (início da quinzena), nutricionista (mês).
create function private.mes_do_lancamento(p_linha jsonb) returns date
language sql immutable set search_path = ''
as $$ select date_trunc('month', coalesce(p_linha->>'data', p_linha->>'inicio', p_linha->>'mes')::date)::date $$;

create function private.travar_mes_fechado() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha jsonb;
begin
  foreach v_linha in array array[case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end] loop
    if v_linha is not null and exists (
      select 1 from public.fechamentos f
      where f.unidade = v_linha->>'unidade' and f.mes = private.mes_do_lancamento(v_linha)
    ) then
      raise exception 'O mês de % está fechado nesta unidade. Só o dono pode reabrir.',
        to_char(private.mes_do_lancamento(v_linha), 'MM/YYYY');
    end if;
  end loop;
  return coalesce(new, old);
end
$$;

create function private.registrar_alteracao() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'atualizado_em' - 'atualizado_por' end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'atualizado_em' - 'atualizado_por' end;
  v_linha jsonb := coalesce(v_depois, v_antes);
begin
  if tg_op = 'UPDATE' and v_antes = v_depois then return null; end if;
  insert into public.alteracoes (por, por_nome, unidade, tabela, referencia, operacao, antes, depois)
  values ((select auth.uid()), (select nome from public.pessoas where user_id = (select auth.uid())),
    v_linha->>'unidade', tg_table_name,
    coalesce(v_linha->>'data', v_linha->>'inicio', v_linha->>'mes') || coalesce(' visita ' || (v_linha->>'visita'), ''),
    case tg_op when 'INSERT' then 'incluiu' when 'UPDATE' then 'alterou' else 'apagou' end, v_antes, v_depois);
  return null;
end
$$;
revoke all on function private.travar_mes_fechado(), private.registrar_alteracao(), private.mes_do_lancamento(jsonb) from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['erros_diarios', 'cmv_quinzena', 'notas_quinzena', 'nutri_visitas'] loop
    execute format('create trigger travar_mes_fechado before insert or update or delete on public.%I
      for each row execute function private.travar_mes_fechado()', t);
    execute format('create trigger registrar_alteracao after insert or update or delete on public.%I
      for each row execute function private.registrar_alteracao()', t);
  end loop;
end
$$;

-- Desempenho de mês fechado = o retrato gravado no fechamento.
do $$
declare
  v_def text := pg_get_functiondef('public.indicadores_mes(text,date)'::regprocedure);
  v_trecho text := $a$  if not private.pode_ver(p_unidade) then
    raise exception 'Acesso negado.';
  end if;
$a$;
begin
  if (length(v_def) - length(replace(v_def, v_trecho, ''))) / length(v_trecho) <> 1 then
    raise exception 'indicadores_mes: trecho da permissão não encontrado';
  end if;
  execute replace(v_def, v_trecho, v_trecho || $b$
  select f.dados || jsonb_build_object('fechamento',
    jsonb_build_object('em', f.fechado_em, 'por', f.fechado_por_nome, 'premios', f.premios))
  into v_resultado
  from public.fechamentos f where f.unidade = p_unidade and f.mes = v_inicio;
  if found then return v_resultado; end if;
$b$);
end
$$;

create function public.fechar_mes(p_unidade text, p_mes date, p_premios jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_nome text;
begin
  if not private.eh_dono() then raise exception 'Só o dono fecha o mês.'; end if;
  if not exists (select 1 from public.unidades where codigo = p_unidade) then raise exception 'Unidade inválida.'; end if;
  if (v_mes + interval '1 month')::date > v_hoje then raise exception 'O mês ainda não terminou.'; end if;
  if jsonb_typeof(p_premios) is distinct from 'object' then raise exception 'Prêmios inválidos.'; end if;
  select nome into v_nome from public.pessoas where user_id = (select auth.uid());
  insert into public.fechamentos (unidade, mes, fechado_por, fechado_por_nome, dados, premios)
  values (p_unidade, v_mes, (select auth.uid()), v_nome, public.indicadores_mes(p_unidade, v_mes), p_premios);
  insert into public.alteracoes (por, por_nome, unidade, tabela, referencia, operacao, depois)
  values ((select auth.uid()), v_nome, p_unidade, 'fechamentos', v_mes::text, 'fechou', p_premios);
exception when unique_violation then
  raise exception 'Este mês já está fechado.';
end
$$;

create function public.reabrir_mes(p_unidade text, p_mes date) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_premios jsonb;
begin
  if not private.eh_dono() then raise exception 'Só o dono reabre o mês.'; end if;
  delete from public.fechamentos where unidade = p_unidade and mes = v_mes returning premios into v_premios;
  if not found then raise exception 'Este mês não está fechado.'; end if;
  insert into public.alteracoes (por, por_nome, unidade, tabela, referencia, operacao, antes)
  values ((select auth.uid()), (select nome from public.pessoas where user_id = (select auth.uid())),
    p_unidade, 'fechamentos', v_mes::text, 'reabriu', v_premios);
end
$$;
revoke all on function public.fechar_mes(text, date, jsonb), public.reabrir_mes(text, date) from public, anon;
grant execute on function public.fechar_mes(text, date, jsonb), public.reabrir_mes(text, date) to authenticated;
