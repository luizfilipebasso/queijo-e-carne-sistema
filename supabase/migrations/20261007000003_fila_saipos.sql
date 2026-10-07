-- Fila de sincronização com a Saipos.
-- Motivo: a Edge Function tem limite de 150 s no plano gratuito e a Saipos às vezes fica lenta.
-- Cada tarefa é pequena (vendas OU itens de um dia), roda uma por vez e é repetida se falhar.

select cron.unschedule('sincronizar-saipos-diario');
drop function private.pedir_sincronizacao(date);

alter table public.saipos_sincronizacoes add column parte text;

create table public.saipos_fila (
  dia date not null,
  parte text not null check (parte in ('vendas', 'itens')),
  tentativas integer not null default 0,
  proxima_em timestamptz not null default now(),
  em_andamento_desde timestamptz,
  concluido_em timestamptz,
  ultimo_erro text,
  primary key (dia, parte)
);
alter table public.saipos_fila enable row level security;
create policy "equipe vê" on public.saipos_fila for select to authenticated
using ((select private.eh_equipe()));

-- Coloca (ou recoloca) dias na fila.
create function private.agendar_dias(p_dias date[]) returns void
language sql security definer set search_path = ''
as $$
  insert into public.saipos_fila (dia, parte)
  select d, p from unnest(p_dias) d cross join (values ('vendas'), ('itens')) partes(p)
  on conflict (dia, parte) do update
    set tentativas = 0, proxima_em = now(), em_andamento_desde = null, concluido_em = null, ultimo_erro = null
$$;

-- Chamada a cada minuto: se nada estiver rodando, manda a próxima tarefa para a Edge Function.
create function private.processar_fila() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t public.saipos_fila;
begin
  -- Execuções que passaram do limite de tempo ficam marcadas como interrompidas.
  update public.saipos_sincronizacoes
  set terminado_em = now(), ok = false, erro = 'Interrompida (tempo limite da Edge Function)'
  where terminado_em is null and iniciado_em < now() - interval '5 minutes';

  if exists (select 1 from public.saipos_fila where em_andamento_desde > now() - interval '3 minutes') then
    return;
  end if;

  select * into t from public.saipos_fila
  where concluido_em is null and tentativas < 6 and proxima_em <= now()
  order by dia, parte
  limit 1
  for update skip locked;
  if not found then
    return;
  end if;

  update public.saipos_fila
  set tentativas = tentativas + 1,
      em_andamento_desde = now(),
      proxima_em = now() + make_interval(mins => 5 * (tentativas + 1))
  where dia = t.dia and parte = t.parte;

  perform net.http_post(
    url := 'https://vcpzwewjwklyjfsuxszg.supabase.co/functions/v1/sincronizar-saipos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-region', 'sa-east-1',
      'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'saipos_sync_chave')
    ),
    body := jsonb_build_object('dia', to_char(t.dia, 'YYYY-MM-DD'), 'parte', t.parte),
    timeout_milliseconds := 160000
  );
end
$$;

revoke all on function private.agendar_dias(date[]), private.processar_fila() from public, anon, authenticated;

-- Todo dia às 06:00 de Brasília (09:00 UTC): ontem e anteontem entram na fila.
select cron.schedule(
  'saipos-agendar-diario',
  '0 9 * * *',
  $$ select private.agendar_dias(array[
       (now() at time zone 'America/Sao_Paulo')::date - 1,
       (now() at time zone 'America/Sao_Paulo')::date - 2
     ]) $$
);

-- A cada minuto: processa a fila (só chama a Edge Function quando há tarefa pendente).
select cron.schedule('saipos-processar-fila', '* * * * *', $$ select private.processar_fila() $$);
