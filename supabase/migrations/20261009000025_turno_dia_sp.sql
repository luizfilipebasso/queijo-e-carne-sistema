-- São Paulo também atualiza durante o dia (dono, 09/10/2026): de hora em hora, das 12h às 19h (Brasília).
-- Noite (SM e SP): 19h30 até 02h00 de meia em meia hora; 03h, 04h e 05h. Às 06h, a busca diária.
create or replace function private.agendar_turno() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_agora timestamp := date_trunc('minute', now() at time zone 'America/Sao_Paulo');
  v_hora time := v_agora::time;
  v_dia date := (v_agora - interval '7 hours')::date;  -- 12h → hoje; 19h30 → hoje; 05h00 → ontem
  v_noite boolean := v_hora >= time '19:30' or v_hora <= time '02:00'
    or (v_hora between time '03:00' and time '05:00' and extract(minute from v_hora) = 0);
  v_dia_sp boolean := v_hora between time '12:00' and time '19:00' and extract(minute from v_hora) = 0;
begin
  if not (v_noite or v_dia_sp) then
    return;
  end if;

  insert into public.saipos_fila (unidade, dia, parte)
  select u.codigo, v_dia, p
  from public.unidades u
  cross join (values ('vendas'), ('itens')) partes(p)
  where u.sincronizar
    and ((v_noite and u.codigo in ('SM', 'SP')) or (v_dia_sp and u.codigo = 'SP'))
  on conflict (unidade, dia, parte) do update
    set tentativas = 0, proxima_em = now(), concluido_em = null, ultimo_erro = null
    where public.saipos_fila.em_andamento_desde is null;  -- não mexe numa tarefa que está rodando
end
$$;
