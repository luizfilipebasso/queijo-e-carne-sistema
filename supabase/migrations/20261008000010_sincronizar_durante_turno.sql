-- Atualização durante o turno de Santa Maria (pedido do dono, 08/10/2026), horário de Brasília:
--   19h30 até 02h00: de meia em meia hora;
--   03h00 até 05h00: de hora em hora (às 06h00 já roda o agendamento diário, que busca ontem e anteontem).
-- Cada vez põe na fila o dia comercial em andamento (venda depois da meia-noite conta no dia anterior).
-- São Paulo terá horário próprio quando o token dela chegar.

create function private.agendar_turno() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_agora timestamp := date_trunc('minute', now() at time zone 'America/Sao_Paulo');
  v_hora time := v_agora::time;
  v_dia date := (v_agora - interval '7 hours')::date;  -- 19h30 → hoje; 05h00 → ontem
begin
  if not (
    v_hora >= time '19:30'
    or v_hora <= time '02:00'
    or (v_hora between time '03:00' and time '05:00' and extract(minute from v_hora) = 0)
  ) then
    return;
  end if;

  insert into public.saipos_fila (unidade, dia, parte)
  select u.codigo, v_dia, p
  from public.unidades u
  cross join (values ('vendas'), ('itens')) partes(p)
  where u.codigo = 'SM' and u.sincronizar
  on conflict (unidade, dia, parte) do update
    set tentativas = 0, proxima_em = now(), concluido_em = null, ultimo_erro = null
    where public.saipos_fila.em_andamento_desde is null;  -- não mexe numa tarefa que está rodando
end
$$;
revoke all on function private.agendar_turno() from public, anon, authenticated;

-- Roda a cada 30 min; a função decide se é horário de buscar.
select cron.schedule('saipos-agendar-turno', '0,30 * * * *', $$ select private.agendar_turno() $$);
