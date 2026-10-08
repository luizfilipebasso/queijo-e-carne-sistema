-- Duas unidades (decisão do dono em 07/10/2026): SM (Santa Maria, matriz) e SP (São Paulo, filial).
-- Tudo o que existe hoje é de SM. SP entra depois só com o token, o id_store e sincronizar = true.

-- ---------- 1. Unidades ----------
create table public.unidades (
  codigo text primary key check (codigo ~ '^[A-Z]{2,4}$'),
  nome text not null,
  turno text,
  id_store_saipos bigint unique,            -- conferido pelo robô antes de gravar
  segredo_token text not null,              -- nome do segredo da Edge Function com o token desta loja
  sincronizar boolean not null default false,
  ordem smallint not null default 0
);
insert into public.unidades (codigo, nome, turno, id_store_saipos, segredo_token, sincronizar, ordem) values
  ('SM', 'Santa Maria', '19h às 01h30', 2960, 'SAIPOS_TOKEN_SM', true, 1),
  ('SP', 'São Paulo', '11h às 23h', null, 'SAIPOS_TOKEN_SP', false, 2);

-- ---------- 2. Vínculos de pessoas com unidades ----------
create table public.pessoa_unidades (
  pessoa_id uuid not null references public.pessoas (id) on delete cascade,
  unidade text not null references public.unidades (codigo),
  papel text not null check (papel in ('gerente', 'funcionario')),
  setor_indicado text check (setor_indicado in ('cozinha', 'atendimento')),
  setor text check (setor in ('cozinha', 'atendimento')),
  ativo boolean not null default true,
  data_inicio date not null default (now() at time zone 'America/Sao_Paulo')::date,
  data_fim date,
  criado_em timestamptz not null default now(),
  primary key (pessoa_id, unidade),
  constraint setor_so_funcionario check (papel = 'funcionario' or setor is null)
);
create index pessoa_unidades_unidade on public.pessoa_unidades (unidade);

-- Quem existe hoje trabalha em SM; a gerente atual também é gerente de SP.
insert into public.pessoa_unidades (pessoa_id, unidade, papel, setor_indicado, setor, ativo, data_inicio, data_fim)
select id, 'SM', papel, setor_indicado, setor, ativo, data_inicio, data_fim
from public.pessoas where papel in ('gerente', 'funcionario');
insert into public.pessoa_unidades (pessoa_id, unidade, papel)
select id, 'SP', 'gerente' from public.pessoas where papel = 'gerente' and ativo;

create function private.datas_do_vinculo() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.ativo and not new.ativo and new.data_fim is null then
    new.data_fim := (now() at time zone 'America/Sao_Paulo')::date;
  elsif tg_op = 'UPDATE' and not old.ativo and new.ativo then
    new.data_fim := null;
  end if;
  if new.papel <> 'funcionario' then
    new.setor := null;
    new.setor_indicado := null;
  end if;
  return new;
end
$$;
create trigger datas_do_vinculo before insert or update on public.pessoa_unidades
for each row execute function private.datas_do_vinculo();

-- ---------- 3. Pessoa passa a ter só identidade + "é dono" ----------
alter table public.pessoas add column eh_dono boolean not null default false;
update public.pessoas set eh_dono = true where papel = 'dono';

-- Remove as políticas antigas (sem unidade) das tabelas que vão mudar.
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'pessoas', 'erros_diarios', 'notas_quinzena', 'cmv_quinzena', 'nutri_visitas',
      'saipos_vendas', 'saipos_itens', 'saipos_sincronizacoes', 'saipos_fila', 'catalogo')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end
$$;

drop function public.painel_mes(date);
drop function public.indicadores_mes(date);
drop function public.indicar_meu_setor(text);
drop function private.classificar(text);
drop function private.eh_equipe();
drop function private.meu_papel();

alter table public.pessoas drop constraint setor_so_funcionario;
alter table public.pessoas drop column papel, drop column setor_indicado, drop column setor,
  drop column data_inicio, drop column data_fim;

create or replace function private.preparar_pessoa() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end
$$;

-- ---------- 4. Funções de permissão por unidade ----------
create or replace function private.eh_dono() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select eh_dono from public.pessoas where user_id = (select auth.uid()) and ativo), false)
$$;

create function private.minha_pessoa() returns uuid
language sql stable security definer set search_path = ''
as $$ select id from public.pessoas where user_id = (select auth.uid()) and ativo $$;

-- Vê os dados da unidade: dono, ou quem tem vínculo ativo nela.
create function private.pode_ver(p_unidade text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.eh_dono() or exists (
    select 1 from public.pessoa_unidades v
    where v.pessoa_id = private.minha_pessoa() and v.unidade = p_unidade and v.ativo)
$$;

-- Lança e vê vendas da unidade: dono, ou gerente ativo dela.
create function private.eh_equipe(p_unidade text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.eh_dono() or exists (
    select 1 from public.pessoa_unidades v
    where v.pessoa_id = private.minha_pessoa() and v.unidade = p_unidade and v.ativo and v.papel = 'gerente')
$$;

revoke all on function private.eh_dono(), private.minha_pessoa(), private.pode_ver(text), private.eh_equipe(text) from public;
grant execute on function private.eh_dono(), private.minha_pessoa(), private.pode_ver(text), private.eh_equipe(text) to authenticated;

-- ---------- 5. Unidade em todas as tabelas de dados ----------
alter table public.erros_diarios add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.notas_quinzena add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.cmv_quinzena add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.nutri_visitas add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.saipos_vendas add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.saipos_itens add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.saipos_sincronizacoes add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.saipos_fila add column unidade text not null default 'SM' references public.unidades (codigo);

-- Sem valor padrão daqui em diante: toda gravação precisa dizer a unidade.
do $$
declare
  t text;
begin
  foreach t in array array['erros_diarios', 'notas_quinzena', 'cmv_quinzena', 'nutri_visitas',
    'saipos_vendas', 'saipos_itens', 'saipos_sincronizacoes', 'saipos_fila'] loop
    execute format('alter table public.%I alter column unidade drop default', t);
  end loop;
end
$$;

alter table public.erros_diarios drop constraint erros_diarios_pkey, add primary key (unidade, data);
alter table public.notas_quinzena drop constraint notas_quinzena_pkey, add primary key (unidade, inicio);
alter table public.cmv_quinzena drop constraint cmv_quinzena_pkey, add primary key (unidade, inicio);
alter table public.nutri_visitas drop constraint nutri_visitas_pkey, add primary key (unidade, mes, visita);
alter table public.saipos_vendas drop constraint saipos_vendas_pkey, add primary key (unidade, id_sale);
alter table public.saipos_itens drop constraint saipos_itens_pkey, add primary key (unidade, id_sale_item);
alter table public.saipos_fila drop constraint saipos_fila_pkey, add primary key (unidade, dia, parte);

drop index public.saipos_vendas_data;
drop index public.saipos_itens_data;
drop index public.saipos_itens_venda;
drop index public.saipos_sincronizacoes_dia;
create index saipos_vendas_data on public.saipos_vendas (unidade, data);
create index saipos_itens_data on public.saipos_itens (unidade, data);
create index saipos_itens_venda on public.saipos_itens (unidade, id_sale);
create index saipos_sincronizacoes_dia on public.saipos_sincronizacoes (unidade, dia, iniciado_em desc);

-- ---------- 6. Metas, parâmetros e cardápio por unidade ----------
create table public.metas (
  unidade text not null references public.unidades (codigo),
  indicador text not null check (indicador in
    ('cmv', 'ifood', 'f99', 'nutri', 'erros', 'aguardando', 'cozinha', 'ticket_balcao', 'ticket_delivery')),
  vale_a_partir_de date not null,           -- mudar uma meta = nova linha; meses anteriores continuam com a antiga
  meta numeric not null,
  super_meta numeric,
  maior_melhor boolean not null,
  premio_meta numeric not null default 0,
  premio_super numeric not null default 0,
  publico text check (publico in ('todos', 'cozinha', 'atendimento')),   -- nulo = só referência, sem prêmio
  primary key (unidade, indicador, vale_a_partir_de)
);
insert into public.metas (unidade, indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico)
select u.codigo, m.* from public.unidades u cross join (values
  ('cmv', date '2026-01-01', 34, 32, false, 50, 100, 'todos'),
  ('ifood', date '2026-01-01', 4.90, 5.00, true, 25, 50, 'todos'),
  ('f99', date '2026-01-01', 4.90, 5.00, true, 25, 50, 'todos'),
  ('nutri', date '2026-01-01', 90, 95, true, 25, 50, 'todos'),
  ('erros', date '2026-01-01', 1.5, 0.8, false, 50, 100, 'todos'),
  ('aguardando', date '2026-01-01', 180, 120, false, 50, 100, 'atendimento'),
  ('cozinha', date '2026-01-01', 360, 300, false, 50, 100, 'cozinha'),
  ('ticket_balcao', date '2026-01-01', 70, null, true, 0, 0, null),
  ('ticket_delivery', date '2026-01-01', 90, null, true, 0, 0, null)
) as m(indicador, vale_a_partir_de, meta, super_meta, maior_melhor, premio_meta, premio_super, publico);

create table public.parametros (
  unidade text not null references public.unidades (codigo),
  chave text not null,
  vale_a_partir_de date not null,
  valor numeric not null,
  primary key (unidade, chave, vale_a_partir_de)
);
-- Pedido com mais de 40 min na cozinha fica fora da média de cozinha (decisão do dono, 07/10/2026).
insert into public.parametros (unidade, chave, vale_a_partir_de, valor)
select codigo, 'cozinha_limite_seg', date '2026-01-01', 2400 from public.unidades;

alter table public.catalogo add column unidade text not null default 'SM' references public.unidades (codigo);
alter table public.catalogo alter column unidade drop default;
alter table public.catalogo drop constraint catalogo_pkey, add primary key (unidade, ordem);
insert into public.catalogo (unidade, ordem, padrao, grupo, nome, unidades)
select 'SP', ordem, padrao, grupo, nome, unidades from public.catalogo where unidade = 'SM';

-- Metas vigentes de uma unidade numa data, no formato {indicador: {meta, super_meta, ...}}.
create function private.metas_vigentes(p_unidade text, p_data date) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(indicador, to_jsonb(m) - 'unidade' - 'indicador'), '{}')
  from (
    select distinct on (indicador) *
    from public.metas
    where unidade = p_unidade and vale_a_partir_de <= p_data
    order by indicador, vale_a_partir_de desc
  ) m
$$;

create function private.parametro(p_unidade text, p_chave text, p_data date) returns numeric
language sql stable set search_path = ''
as $$
  select valor from public.parametros
  where unidade = p_unidade and chave = p_chave and vale_a_partir_de <= p_data
  order by vale_a_partir_de desc limit 1
$$;

create function private.classificar(p_unidade text, p_descricao text)
returns table (grupo text, nome text, unidades integer)
language sql stable set search_path = ''
as $$
  select c.grupo, coalesce(c.nome, p_descricao), c.unidades
  from public.catalogo c
  where c.unidade = p_unidade and p_descricao ~* c.padrao
  order by c.ordem
  limit 1
$$;

-- ---------- 7. Regras de acesso (RLS) com unidade ----------
alter table public.unidades enable row level security;
alter table public.pessoa_unidades enable row level security;
alter table public.metas enable row level security;
alter table public.parametros enable row level security;

create policy "vê as suas unidades" on public.unidades for select to authenticated
using ((select private.pode_ver(codigo)));

-- Pessoas: dono vê todos; cada um vê a si; gerente vê quem tem vínculo nas unidades dele.
create policy "quem pode ver" on public.pessoas for select to authenticated
using (
  (select private.eh_dono())
  or user_id = (select auth.uid())
  or exists (select 1 from public.pessoa_unidades v where v.pessoa_id = pessoas.id and private.eh_equipe(v.unidade))
);
create policy "dono cadastra" on public.pessoas for insert to authenticated with check ((select private.eh_dono()));
create policy "dono edita" on public.pessoas for update to authenticated
using ((select private.eh_dono())) with check ((select private.eh_dono()));
create policy "dono remove" on public.pessoas for delete to authenticated using ((select private.eh_dono()));

create policy "quem pode ver" on public.pessoa_unidades for select to authenticated
using (pessoa_id = (select private.minha_pessoa()) or private.eh_equipe(unidade));
create policy "dono cadastra" on public.pessoa_unidades for insert to authenticated with check ((select private.eh_dono()));
create policy "dono edita" on public.pessoa_unidades for update to authenticated
using ((select private.eh_dono())) with check ((select private.eh_dono()));
create policy "dono remove" on public.pessoa_unidades for delete to authenticated using ((select private.eh_dono()));

do $$
declare
  t text;
begin
  -- Lançamentos: quem tem vínculo na unidade vê; dono e gerente da unidade lançam.
  foreach t in array array['erros_diarios', 'notas_quinzena', 'cmv_quinzena', 'nutri_visitas'] loop
    execute format('create policy "quem é da unidade vê" on public.%I for select to authenticated using (private.pode_ver(unidade))', t);
    execute format('create policy "equipe da unidade lança" on public.%I for insert to authenticated with check (private.eh_equipe(unidade))', t);
    execute format('create policy "equipe da unidade corrige" on public.%I for update to authenticated using (private.eh_equipe(unidade)) with check (private.eh_equipe(unidade))', t);
    execute format('create policy "equipe da unidade apaga" on public.%I for delete to authenticated using (private.eh_equipe(unidade))', t);
  end loop;
  -- Dados da Saipos: só dono e gerente da unidade leem; só o robô grava.
  foreach t in array array['saipos_vendas', 'saipos_itens', 'saipos_sincronizacoes', 'saipos_fila', 'catalogo'] loop
    execute format('create policy "equipe da unidade vê" on public.%I for select to authenticated using (private.eh_equipe(unidade))', t);
  end loop;
  -- Metas e parâmetros: quem é da unidade vê; só o dono muda.
  foreach t in array array['metas', 'parametros'] loop
    execute format('create policy "quem é da unidade vê" on public.%I for select to authenticated using (private.pode_ver(unidade))', t);
    execute format('create policy "dono muda" on public.%I for all to authenticated using ((select private.eh_dono())) with check ((select private.eh_dono()))', t);
  end loop;
end
$$;
create policy "dono muda" on public.catalogo for all to authenticated
using ((select private.eh_dono())) with check ((select private.eh_dono()));

-- ---------- 8. Funções usadas pelo site ----------
-- O funcionário indica o próprio setor numa unidade; só vale quando o dono confirma.
create function public.indicar_meu_setor(p_unidade text, p_setor text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_setor not in ('cozinha', 'atendimento') then
    raise exception 'Setor inválido.';
  end if;
  update public.pessoa_unidades set setor_indicado = p_setor
  where pessoa_id = private.minha_pessoa() and unidade = p_unidade and ativo and papel = 'funcionario';
end
$$;

-- Painel de uma unidade (dono e gerente da unidade).
create function public.painel_mes(p_unidade text, p_mes date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_resultado jsonb;
begin
  if not private.eh_equipe(p_unidade) then
    raise exception 'Acesso restrito ao dono e à gerência desta unidade.';
  end if;

  with vendas as (
    select * from public.saipos_vendas
    where unidade = p_unidade and data between v_inicio and v_fim and not cancelada
  ),
  itens as (
    select i.*, i.quantidade * (i.preco_unitario + coalesce((select sum((e->>'preco')::numeric) from jsonb_array_elements(i.escolhas) e), 0)) as receita
    from public.saipos_itens i join vendas v using (unidade, id_sale)
    where not i.apagado
  ),
  escolhas as (
    select i.descricao as item, i.quantidade, e->>'descricao' as escolha, c.grupo, c.nome, c.unidades
    from itens i
    cross join jsonb_array_elements(i.escolhas) e
    left join lateral private.classificar(p_unidade, e->>'descricao') c on true
  ),
  combos as (
    select distinct item from escolhas where grupo = 'burger'
  ),
  burgers as (
    select c.nome, sum(i.quantidade * c.unidades) as qtd
    from itens i cross join lateral private.classificar(p_unidade, i.descricao) c
    where c.grupo = 'burger' and not private.eh_item_dia(i.descricao)
    group by c.nome
    union all
    select nome, sum(quantidade * unidades) from escolhas where grupo = 'burger' group by nome
  ),
  ultimo_dia as (
    select max(data) as dia from vendas
  )
  select jsonb_build_object(
    'unidade', p_unidade,
    'mes', v_inicio,
    'metas', private.metas_vigentes(p_unidade, v_fim),
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

-- Indicadores de uma unidade (todos com vínculo nela; sem faturamento).
create function public.indicadores_mes(p_unidade text, p_mes date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
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
$$;

-- Comparativo do mês: uma linha por unidade que a pessoa gerencia + o total delas.
create function public.comparativo_mes(p_mes date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
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
    select e.unidade, sum(e.erros_cozinha + e.erros_atendimento) as qtd, count(*) as dias
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
        'erros_pct', (select case when e.dias > 0 and l.pedidos > 0 then round(e.qtd * 100.0 / l.pedidos, 2) end from erros e where e.unidade = l.unidade),
        'metas', private.metas_vigentes(l.unidade, v_fim)
      ) order by l.ordem) from linhas l), '[]'),
    'total', (select jsonb_build_object(
        'faturamento', coalesce(sum(total), 0),
        'pedidos', count(*),
        'ticket_balcao', round(avg(total) filter (where tipo = 'balcao' and not fiado), 2),
        'ticket_delivery', round(avg(total) filter (where tipo = 'delivery' and not fiado), 2),
        'seg_cozinha', round(avg(seg_cozinha) filter (where tipo = 'delivery' and not fiado and seg_cozinha <= limite)),
        'seg_aguardando', round(avg(seg_aguardando_entrega) filter (where tipo = 'delivery' and not fiado)),
        'erros_pct', case when (select sum(dias) from erros) > 0 and count(*) > 0
                       then round((select sum(qtd) from erros) * 100.0 / count(*), 2) end
      ) from vendas)
  ) into v_resultado;
  return v_resultado;
end
$$;

revoke all on function public.indicar_meu_setor(text, text), public.painel_mes(text, date),
  public.indicadores_mes(text, date), public.comparativo_mes(date) from public, anon;
grant execute on function public.indicar_meu_setor(text, text), public.painel_mes(text, date),
  public.indicadores_mes(text, date), public.comparativo_mes(date) to authenticated;
revoke all on function private.metas_vigentes(text, date), private.parametro(text, text, date),
  private.classificar(text, text) from public, anon;

-- ---------- 9. Fila de sincronização por unidade ----------
drop function private.agendar_dias(date[]);

-- Coloca (ou recoloca) dias na fila. Sem unidade: todas as unidades com sincronização ligada.
create function private.agendar_dias(p_dias date[], p_unidade text default null) returns void
language sql security definer set search_path = ''
as $$
  insert into public.saipos_fila (unidade, dia, parte)
  select u.codigo, d, p
  from public.unidades u
  cross join unnest(p_dias) d
  cross join (values ('vendas'), ('itens')) partes(p)
  where (p_unidade is null and u.sincronizar) or u.codigo = p_unidade
  on conflict (unidade, dia, parte) do update
    set tentativas = 0, proxima_em = now(), em_andamento_desde = null, concluido_em = null, ultimo_erro = null
$$;

create or replace function private.processar_fila() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.saipos_fila;
begin
  update public.saipos_sincronizacoes
  set terminado_em = now(), ok = false, erro = 'Interrompida (tempo limite da Edge Function)'
  where terminado_em is null and iniciado_em < now() - interval '5 minutes';

  if exists (select 1 from public.saipos_fila where em_andamento_desde > now() - interval '3 minutes') then
    return;
  end if;

  select * into t from public.saipos_fila
  where concluido_em is null and tentativas < 6 and proxima_em <= now()
  order by dia, unidade, parte
  limit 1
  for update skip locked;
  if not found then
    return;
  end if;

  update public.saipos_fila
  set tentativas = tentativas + 1,
      em_andamento_desde = now(),
      proxima_em = now() + make_interval(mins => 5 * (tentativas + 1))
  where unidade = t.unidade and dia = t.dia and parte = t.parte;

  perform net.http_post(
    url := 'https://vcpzwewjwklyjfsuxszg.supabase.co/functions/v1/sincronizar-saipos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-region', 'sa-east-1',
      'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'saipos_sync_chave')
    ),
    body := jsonb_build_object('unidade', t.unidade, 'dia', to_char(t.dia, 'YYYY-MM-DD'), 'parte', t.parte),
    timeout_milliseconds := 160000
  );
end
$$;

revoke all on function private.agendar_dias(date[], text), private.processar_fila() from public, anon, authenticated;
