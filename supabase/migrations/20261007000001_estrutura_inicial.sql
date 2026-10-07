-- Estrutura inicial: pessoas autorizadas, lançamentos manuais e regras de acesso.
-- Papéis: dono (tudo + logins), gerente (tudo menos logins), funcionario (só leitura).

-- ---------- Funções auxiliares (schema privado, não exposto pela API) ----------
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------- Pessoas autorizadas ----------
create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text not null,
  papel text not null check (papel in ('dono', 'gerente', 'funcionario')),
  -- setor_indicado: o funcionário escolhe; setor: o que vale, confirmado pelo dono
  setor_indicado text check (setor_indicado in ('cozinha', 'atendimento')),
  setor text check (setor in ('cozinha', 'atendimento')),
  ativo boolean not null default true,
  data_inicio date not null default (now() at time zone 'America/Sao_Paulo')::date,
  data_fim date,
  user_id uuid unique references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint setor_so_funcionario check (papel = 'funcionario' or setor is null)
);

create function private.meu_papel() returns text
language sql stable security definer set search_path = ''
as $$
  select papel from public.pessoas where user_id = (select auth.uid()) and ativo
$$;

create function private.eh_equipe() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.meu_papel() in ('dono', 'gerente'), false) $$;

create function private.eh_dono() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.meu_papel() = 'dono', false) $$;

revoke all on function private.meu_papel(), private.eh_equipe(), private.eh_dono() from public;
grant execute on function private.meu_papel(), private.eh_equipe(), private.eh_dono() to authenticated;

-- Normaliza o e-mail, liga a pessoa a um login já existente e registra a data de saída.
create function private.preparar_pessoa() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  if tg_op = 'UPDATE' and old.ativo and not new.ativo and new.data_fim is null then
    new.data_fim := (now() at time zone 'America/Sao_Paulo')::date;
  elsif tg_op = 'UPDATE' and not old.ativo and new.ativo then
    new.data_fim := null;
  end if;
  return new;
end
$$;

create trigger preparar_pessoa
before insert or update on public.pessoas
for each row execute function private.preparar_pessoa();

-- Login com Google: só entra quem o dono autorizou antes.
create function private.vincular_usuario() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.pessoas
  where email = lower(new.email) and ativo
  for update;
  if v_id is null then
    raise exception 'E-mail não autorizado. Peça ao dono para liberar o seu acesso.';
  end if;
  update public.pessoas set user_id = new.id where id = v_id;
  return new;
end
$$;

create trigger vincular_usuario
after insert on auth.users
for each row execute function private.vincular_usuario();

-- O funcionário indica o próprio setor; só passa a valer quando o dono confirma.
create function public.indicar_meu_setor(p_setor text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_setor not in ('cozinha', 'atendimento') then
    raise exception 'Setor inválido.';
  end if;
  update public.pessoas set setor_indicado = p_setor
  where user_id = (select auth.uid()) and ativo and papel = 'funcionario';
end
$$;

revoke all on function public.indicar_meu_setor(text) from public, anon;
grant execute on function public.indicar_meu_setor(text) to authenticated;

alter table public.pessoas enable row level security;

create policy "equipe vê todos, funcionário vê a si" on public.pessoas
for select to authenticated
using ((select private.eh_equipe()) or user_id = (select auth.uid()));

create policy "dono cadastra" on public.pessoas
for insert to authenticated with check ((select private.eh_dono()));

create policy "dono edita" on public.pessoas
for update to authenticated
using ((select private.eh_dono())) with check ((select private.eh_dono()));

create policy "dono remove" on public.pessoas
for delete to authenticated using ((select private.eh_dono()));

-- ---------- Lançamentos manuais ----------
create function private.carimbar_alteracao() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := (select auth.uid());
  return new;
end
$$;

-- Erros: um registro por dia comercial.
create table public.erros_diarios (
  data date primary key,
  erros_cozinha integer not null default 0 check (erros_cozinha >= 0),
  erros_atendimento integer not null default 0 check (erros_atendimento >= 0),
  custo_cozinha numeric(10, 2) not null default 0 check (custo_cozinha >= 0),
  custo_atendimento numeric(10, 2) not null default 0 check (custo_atendimento >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

-- Quinzenas: "inicio" é dia 1 (1ª quinzena, até 15) ou dia 16 (2ª, até o fim do mês).
create table public.notas_quinzena (
  inicio date primary key check (extract(day from inicio) in (1, 16)),
  nota_ifood numeric(3, 2) check (nota_ifood between 0 and 5),
  nota_99food numeric(3, 2) check (nota_99food between 0 and 5),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

create table public.cmv_quinzena (
  inicio date primary key check (extract(day from inicio) in (1, 16)),
  estoque_inicial numeric(12, 2) check (estoque_inicial >= 0),
  estoque_final numeric(12, 2) check (estoque_final >= 0),
  cmv_pct numeric(5, 2) check (cmv_pct between 0 and 100),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

-- Nutricionista: 2 visitas por mês ("mes" é sempre o dia 1 do mês).
create table public.nutri_visitas (
  mes date not null check (extract(day from mes) = 1),
  visita smallint not null check (visita in (1, 2)),
  data_visita date not null,
  nota_pct numeric(5, 2) not null check (nota_pct between 0 and 100),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null,
  primary key (mes, visita),
  constraint visita_dentro_do_mes check (date_trunc('month', data_visita)::date = mes)
);

do $$
declare
  t text;
begin
  foreach t in array array['erros_diarios', 'notas_quinzena', 'cmv_quinzena', 'nutri_visitas'] loop
    execute format(
      'create trigger carimbar_alteracao before insert or update on public.%I
       for each row execute function private.carimbar_alteracao()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "pessoas ativas veem" on public.%I for select to authenticated
       using ((select private.meu_papel()) is not null)', t);
    execute format(
      'create policy "equipe lança" on public.%I for insert to authenticated
       with check ((select private.eh_equipe()))', t);
    execute format(
      'create policy "equipe corrige" on public.%I for update to authenticated
       using ((select private.eh_equipe())) with check ((select private.eh_equipe()))', t);
    execute format(
      'create policy "equipe apaga" on public.%I for delete to authenticated
       using ((select private.eh_equipe()))', t);
  end loop;
end
$$;
