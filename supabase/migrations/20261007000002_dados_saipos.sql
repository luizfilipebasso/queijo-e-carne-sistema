-- Dados vindos da API da Saipos, gravados pela Edge Function "sincronizar-saipos".
-- Nenhum dado pessoal de cliente é guardado (nome, telefone, endereço, documento).

-- Uma linha por venda. "data" é o dia comercial (shift_date: venda depois da meia-noite conta no dia anterior).
create table public.saipos_vendas (
  id_sale bigint primary key,
  data date not null,
  criado_em timestamp not null,             -- horário de Brasília, como vem da Saipos
  canal text not null,                      -- ifood, alloy, delivery_much, goomer, telefone ou outro
  canal_original text,                      -- texto da Saipos, para conferência
  tipo text not null,                       -- delivery, balcao ou outro
  cancelada boolean not null,
  fiado boolean not null,                   -- algum pagamento "FIADO FUNCIONARIOS/ENTREGADORES"
  total numeric(12, 2) not null,
  seg_cozinha integer,                      -- soma do tempo no status "Cozinha"
  seg_aguardando_entrega integer,           -- soma do tempo no status "Aguardando entrega"
  atualizado_saipos timestamp,
  sincronizado_em timestamptz not null default now()
);
create index saipos_vendas_data on public.saipos_vendas (data);

-- Uma linha por item vendido (inclui itens apagados, marcados em "apagado").
create table public.saipos_itens (
  id_sale_item bigint primary key,
  id_sale bigint not null,
  data date not null,
  descricao text not null,
  quantidade numeric(10, 3) not null,
  preco_unitario numeric(12, 2) not null,
  apagado boolean not null,
  escolhas jsonb not null default '[]',     -- [{"descricao": "...", "preco": 0}] (ex.: burger e bebida do combo)
  sincronizado_em timestamptz not null default now()
);
create index saipos_itens_data on public.saipos_itens (data);
create index saipos_itens_venda on public.saipos_itens (id_sale);

-- Registro de cada sincronização (para saber se o robô rodou e se deu erro).
create table public.saipos_sincronizacoes (
  id bigint generated always as identity primary key,
  dia date not null,
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  vendas integer,
  itens integer,
  ok boolean,
  erro text
);
create index saipos_sincronizacoes_dia on public.saipos_sincronizacoes (dia, iniciado_em desc);

-- Leitura: só dono e gerente. Funcionários verão só os números do incentivo, por funções próprias (etapa 5).
-- Escrita: nenhuma política; só a Edge Function grava (ela usa a chave de serviço, que ignora RLS).
do $$
declare
  t text;
begin
  foreach t in array array['saipos_vendas', 'saipos_itens', 'saipos_sincronizacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "equipe vê" on public.%I for select to authenticated
       using ((select private.eh_equipe()))', t);
  end loop;
end
$$;

-- ---------- Chave que autoriza o agendamento a chamar a Edge Function ----------
-- Gerada aqui dentro e guardada no cofre (Vault); nunca aparece em arquivo.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'saipos_sync_chave',
  'Autoriza o pg_cron a chamar a Edge Function sincronizar-saipos'
);

create function public.sync_chave_valida(p_chave text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'saipos_sync_chave' and decrypted_secret = p_chave
  )
$$;
revoke all on function public.sync_chave_valida(text) from public, anon, authenticated;
grant execute on function public.sync_chave_valida(text) to service_role;

-- ---------- Agendamento ----------
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Pede à Edge Function para sincronizar um dia (chamada assíncrona).
create function private.pedir_sincronizacao(p_dia date) returns bigint
language sql security definer set search_path = ''
as $$
  select net.http_post(
    url := 'https://vcpzwewjwklyjfsuxszg.supabase.co/functions/v1/sincronizar-saipos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-region', 'sa-east-1',
      'x-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'saipos_sync_chave')
    ),
    body := jsonb_build_object('dia', to_char(p_dia, 'YYYY-MM-DD')),
    timeout_milliseconds := 150000
  )
$$;
revoke all on function private.pedir_sincronizacao(date) from public, anon, authenticated;

-- Todo dia às 06:00 de Brasília (09:00 UTC): ontem e anteontem (pega correções tardias).
-- A Saipos recomenda consultar a partir das 05:00.
select cron.schedule(
  'sincronizar-saipos-diario',
  '0 9 * * *',
  $$
    select private.pedir_sincronizacao((now() at time zone 'America/Sao_Paulo')::date - 1);
    select private.pedir_sincronizacao((now() at time zone 'America/Sao_Paulo')::date - 2);
  $$
);
